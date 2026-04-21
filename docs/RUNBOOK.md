# StackPlus — Runbook operacional

Procedimentos práticos pra quando der ruim. Documento vivo — atualiza
sempre que surgir uma situação nova que precise de ação manual.

Índice:
- [Deploy](#deploy)
- [Rollback](#rollback)
- [Prisma migration errors](#prisma-migration-errors)
- [ANNAPAY troubleshooting](#annapay-troubleshooting)
- [DB manutenção](#db-manutenção)
- [Sentry — monitoramento de erros](#sentry--monitoramento-de-erros)
- [Rotação de secrets](#rotação-de-secrets)
- [Logs no Railway](#logs-no-railway)
- [Detecção de arquivos truncados (Cowork)](#detecção-de-arquivos-truncados-cowork)

---

## Deploy

Fluxo padrão (automático): `git push origin main` → Railway redeploya backend, Vercel redeploya frontend.

**Deploy manual (force redeploy):**

```powershell
# Força rebuild sem mudança real (útil pra pegar nova env var ou bugs de cache):
cd C:\dev\StackPlus
git commit --allow-empty -m "chore: force redeploy"
git push origin main
```

Ou no Railway UI: projeto → serviço → **Deployments** → botão `Redeploy` no último deploy.

**Antes de push:**
1. `npx tsc --noEmit` na pasta do serviço afetado (api/web)
2. `npm test` (api) → esperar os 60 passed
3. `./scripts/check-truncation.ps1` (raiz do monorepo) — detecta bug do mount Cowork
4. `git status` pra confirmar que só os arquivos esperados estão staged

---

## Rollback

Rollback via Railway (mais rápido pra emergência):

1. Railway → projeto → **stackplus-api** → **Deployments**
2. Clica nos 3 pontinhos do deploy que queremos voltar → **Redeploy**

Rollback via git (mais limpo):

```powershell
cd C:\dev\StackPlus

# Lista commits recentes
git log --oneline -10

# Reverte um commit específico (cria commit novo de reversão — NÃO reescreve histórico)
git revert <sha-do-commit-ruim>
git push origin main
```

**Não usar `git reset --hard` em main depois de push.** Se for estritamente necessário rescrever histórico, alinha com o time antes.

---

## Prisma migration errors

### P3009 — migration failed não pode aplicar novas

Acontece quando uma migration começa mas falha no meio. Railway bloqueia
deploys seguintes com:

```
Error: P3009
migrate found failed migrations in the target database
The `<nome_migration>` migration started at <timestamp> failed
```

**Fix (via Railway Data UI ou CLI Postgres):**

1. Abre Railway → serviço **Postgres** → **Database** → **Query**
2. Confirma a migration falha:

   ```sql
   SELECT migration_name, started_at, finished_at, applied_steps_count
   FROM public._prisma_migrations
   WHERE finished_at IS NULL
   ORDER BY started_at DESC;
   ```

3. Apaga o registro falho:

   ```sql
   DELETE FROM public._prisma_migrations
   WHERE migration_name = '<nome_da_migration>';
   ```

4. Verifica se a migration criou tabelas parciais:

   ```sql
   -- Substitui 'MinhaTabela' pela tabela que a migration deveria criar
   SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'MinhaTabela';
   ```

   Se existir, dropa:

   ```sql
   DROP TABLE "MinhaTabela";
   ```

5. Corrige o SQL da migration localmente, commita e faz push. Railway vai
   re-aplicar a versão corrigida.

**Causa comum do P3009:** usar `UUID` + `gen_random_uuid()` num Postgres
sem extensão `pgcrypto`. Usar `TEXT` pra compat com Prisma `@default(uuid())`.

### Baseline (novo ambiente sem histórico de migrations)

Se ambiente novo (DB fresh) → `npx prisma migrate deploy` faz tudo.

Se ambiente herdado (tabelas já existem mas `_prisma_migrations` vazia):

```powershell
npx prisma migrate resolve --applied <nome_de_todas_migrations>
```

---

## ANNAPAY troubleshooting

### PIX recebido mas transação não registrou

Fluxo esperado: cliente paga → webhook ou polling → `settlePrepaidCharge` atomic.

Debug:

1. Pega o `chargeId` no log do Sentry ou Railway.
2. Verifica no DB se o registro existe:

   ```sql
   SELECT id, status, "sessionId", "userId", "createdAt"
   FROM "PrepaidChargePending"
   WHERE "chargeId" = '<chargeId>';
   ```

3. Se status = `PENDING`: webhook não chegou e polling não rodou. Verificar:
   - Saldo ANNAPAY: `GET /api/banking/annapay/balance` (autenticado como ADMIN)
   - Logs Railway filtrando por `chargeId`
4. Se status = `PROCESSING`: travou no meio. Pode ter sido crash. Limpar:

   ```sql
   UPDATE "PrepaidChargePending"
   SET status = 'PENDING'
   WHERE "chargeId" = '<chargeId>' AND status = 'PROCESSING'
     AND "updatedAt" < NOW() - INTERVAL '10 minutes';
   ```

   Depois reprocessa via polling manual do frontend.

### Webhook falhando (401 invalid-secret)

Sentry vai alertar `annapay webhook invalid secret attempt`. Causas:

- `ANNAPAY_WEBHOOK_SECRET` no Railway diferente do configurado no painel ANNAPAY
- Alguém tentando forçar (bot)

Fix: comparar `ANNAPAY_WEBHOOK_SECRET` em Railway Variables com o painel ANNAPAY → Webhooks.

### Reconciliação manual do saldo bancário

Se `HomeGame.bankBalance` divergir do extrato ANNAPAY:

```
POST /api/comanda/bank/reconcile
Body: { "homeGameId": "..." }
```

Cria lançamentos retroativos pra PIX confirmados antes da tabela `HomeGameBankTransaction` existir. Idempotente (checa `existingTxs` por `comandaItemId`).

---

## DB manutenção

### Cleanup de refresh tokens expirados

Tabela `RefreshToken` cresce sem parar. Cron recomendado: semanal.

**Manual (emergência ou ad-hoc):**

```powershell
cd C:\dev\StackPlus\stackplus-api
npm run job:cleanup-refresh-tokens
```

Apaga tokens expirados ou revogados há mais de 7 dias (grace period mantém
tokens recentes pra forense caso precise detectar reuso).

**Agendado no Railway:**

1. Railway → projeto → **+ New** → **Empty Service**
2. Conecta no mesmo repo (ou serviço separado duplicando o `stackplus-api`)
3. Settings → **Service Type: Cron**
4. Schedule: `0 3 * * 0` (domingo 3h UTC)
5. Start Command: `npm run job:cleanup-refresh-tokens`

### Backup do Postgres

Railway faz snapshots automáticos. Ver: projeto → Postgres → **Backups**.

**Restaurar** (em emergência real):

1. Railway → Postgres → **Backups** → escolhe snapshot
2. **Restore to new database**
3. Atualizar `DATABASE_URL` no `stackplus-api` pra apontar pro novo DB
4. Redeploy

**Backup manual adicional** (antes de operação destrutiva):

```powershell
# Precisa CLI Railway instalada e logada
railway run --service Postgres pg_dump $DATABASE_URL > backup-$(Get-Date -Format yyyyMMdd-HHmm).sql
```

### Queries lentas

Sentry não captura isso automaticamente. Alternativa: logs do Railway.

Pra identificar queries lentas no Postgres (precisa superuser, que não temos em Railway plano atual):

```sql
-- Top 10 queries mais lentas (requer pg_stat_statements habilitado)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

Se pg_stat_statements não estiver disponível, usa EXPLAIN ANALYZE manual nas queries suspeitas.

---

## Sentry — monitoramento de erros

URL: https://sentry.io → projeto stackplus-api

**Rotinas:**
- **Diária**: checar aba Issues por novos errors ≥ 1 occurrence.
- **Semanal**: verificar trend de erros. Fechar (resolve) issues fixadas.
- **Mensal**: revisar volume de eventos vs cota (free tier: 5k/mês).

**Quando um erro aparecer:**

1. Clica no issue → vê stack trace completa + request breadcrumbs
2. Tags importantes:
   - `requestId`: correlaciona com logs do Railway (`pino` loga o mesmo)
   - `route`: identifica endpoint
   - `userId`: contata user se necessário
3. Reproduce local se possível
4. Fix + push → Sentry resolve automaticamente quando não aparecer mais

**Erros esperados que PODEM ser ignorados:**
- `Credenciais inválidas` (401): rotineiro
- `Token expirado` (401 em endpoint não-auth): SEC-004 refresh resolve transparente

---

## Rotação de secrets

**Quando rotacionar:**
- `JWT_SECRET` — anualmente OU se vazar → **desloga todos os usuários**
- `ANNAPAY_WEBHOOK_SECRET` — quando trocar senha no painel ANNAPAY
- `ANNAPAY_CLIENT_SECRET` — idem
- `SENTRY_DSN` — raro; troca se projeto Sentry for recriado

**Processo `JWT_SECRET` (CUIDADO: desloga geral):**

1. Gera novo valor:
   ```powershell
   [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([guid]::NewGuid().ToString()+[guid]::NewGuid().ToString()))
   ```
2. Railway → stackplus-api → Variables → atualiza `JWT_SECRET`
3. Railway redeploya (~2min)
4. Avisa usuários que vão precisar relogar

**Processo `ANNAPAY_WEBHOOK_SECRET`:**

1. Gera novo valor (mesma forma acima)
2. Atualiza no painel ANNAPAY → Webhooks → edita → cola novo secret
3. Atualiza no Railway Variables
4. Redeploy

Sem janela de "desligamento": webhook invalid-secret é 401 idempotente, ANNAPAY re-tenta.

---

## Logs no Railway

Railway → stackplus-api → **Deployments** → clica no deploy ativo → **View Logs**.

Pino grava JSON estruturado. Filtros úteis:

- Por `requestId`: copia do Sentry issue → cola no filtro do log Railway
- Por `userId`: `user-<uuid>`
- Por nível: `"level":40` (warn), `"level":50` (error)

Logs ficam ~7 dias no Railway free tier. Pra histórico mais longo, considerar integração futura com Logtail/Datadog.

---

## Detecção de arquivos truncados (Cowork)

Bug intermitente do mount FUSE/virtiofs: arquivos grandes (~20-60KB, 500-1500 linhas) às vezes são truncados na sincronização sandbox → Windows.

**Antes de qualquer commit de refactor grande:**

```powershell
cd C:\dev\StackPlus
./scripts/check-truncation.ps1
```

Se detectar, restaura do HEAD:

```powershell
./scripts/check-truncation.ps1 -Fix
```

Detalhes da investigação: [docs/TRUNCATION-BUG.md](./TRUNCATION-BUG.md).

---

## Checklist pós-incidente

Após um incidente de produção, documentar:

1. **O que aconteceu** (sintoma + tempo de detecção + tempo de resolução)
2. **Causa raiz** (o quê EXATAMENTE causou)
3. **Ação tomada**
4. **Follow-up** (ajustes pra não repetir)

Criar issue no GitHub com label `incident` ou nota em `docs/INCIDENTS.md` se começar a ter histórico.
