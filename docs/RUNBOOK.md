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

## Health checks e monitoring externo

### Endpoints de health check

**`GET /health`** (check raso, sem autenticação)

Retorna 200 sempre que o processo Node está vivo e respondendo. Útil pra
balanceadores / probes de liveness. **Não detecta falhas de configuração**:
no incidente de 21/04, `/health` respondia OK enquanto `JWT_SECRET` estava
ausente e qualquer login quebrava.

**`GET /health/deep`** (check profundo, sem autenticação)

Retorna 200 se todos os checks passam, 503 se qualquer falhar. Checks atuais:

| Check      | O que valida                                        | Hint em caso de falha |
| ---------- | --------------------------------------------------- | --------------------- |
| `database` | `SELECT 1` via Prisma (conectividade + credenciais) | `db-unreachable`      |
| `jwt`      | Roundtrip sign+verify com `JWT_SECRET`              | `jwt-unconfigured` ou `roundtrip-mismatch` |
| `env`      | Variáveis críticas presentes e não-vazias           | `missing:VAR1,VAR2,...` |

**Variáveis críticas verificadas em `env`:**
`DATABASE_URL`, `JWT_SECRET`, `ANNAPAY_CLIENT_ID`, `ANNAPAY_CLIENT_SECRET`,
`ANNAPAY_WEBHOOK_SECRET`, `FRONTEND_URL`, `API_PUBLIC_URL`,
`SANGEUR_WEBHOOK_SECRET`.

Pra adicionar/remover variáveis da lista, editar `criticalEnvs` em
`stackplus-api/src/app.ts`.

**Exposição segura:** endpoint público não-autenticado. Expõe apenas flags
`ok` + `hint` curto. Detalhes de erro do Prisma/JWT vão pro log interno via
pino (buscáveis no Railway + correlacionáveis com Sentry via `requestId`).

### Monitoring externo — Better Stack

Conta: https://betterstack.com/uptime (free tier, 10 monitors, checks 30s mínimo).

Monitors ativos:

| Monitor                                   | Frequência | Keyword      | O que pega                  |
| ----------------------------------------- | ---------- | ------------ | --------------------------- |
| `https://api.stackplus.com.br/health/deep`| 3min       | `"ok":true`  | DB/JWT/env criticos         |
| `https://stackplus-web-chi.vercel.app`    | 3min       | (status 200) | Frontend up                 |

Alertas via email. Escalation policy: imediato no incident, notifica também
no resolved.

**Status page pública**: `status.stackplus.com.br` (CNAME gerenciado no
Vercel DNS apontando pro Better Stack).

### Resposta a alerta de `/health/deep` 503

1. Abre o email do Better Stack → vê qual hint está no payload
2. Mapeamento rápido:
   - `db-unreachable` → Railway → Postgres → Logs; problema pode ser Railway degradation ou ssl handshake
   - `jwt-unconfigured` → Railway → stackplus-api → Variables → confere `JWT_SECRET` presente e não-vazio
   - `missing:VAR1,...` → Railway → Variables → recria as vars listadas a partir do `.env.example`
3. Após fix, Better Stack auto-resolve em 1 check cycle (≤3min)

---

## Checklist pós-incidente

Após um incidente de produção, documentar:

1. **O que aconteceu** (sintoma + tempo de detecção + tempo de resolução)
2. **Causa raiz** (o quê EXATAMENTE causou)
3. **Ação tomada**
4. **Follow-up** (ajustes pra não repetir)

Criar issue no GitHub com label `incident` ou nota em `docs/INCIDENTS.md` se começar a ter histórico.

---

## Histórico de incidentes

### 2026-04-21 — Source Docker sequestrado (stackplus-api offline ~30min)

**Sintoma**: frontend retornando 404 "Application not found" em todas as chamadas de API.

**Causa raiz**: durante setup de um novo Cron Service no Railway, o painel do `stackplus-api` ficou com **Source Image = `evoapicloud/evolution-api:latest`** (imagem Docker pública da Evolution API, não do nosso repo). Deploy passou a rodar essa imagem aleatória em vez do nosso código → `prisma/schema.prisma not found`. Provável causa: clique errado no UI ao configurar o Cron, ou bug do Railway que confundiu serviços.

**Ação**: Disconnect da Source Docker → Reconnect GitHub `denaao/stackplus` → Root Directory `stackplus-api`. Domain antigo `stackplus-api.up.railway.app` foi desvinculado; Railway gerou novo domain `stackplus-production-6b11.up.railway.app`. Variables preservadas automaticamente. Atualizado `NEXT_PUBLIC_API_URL` no Vercel + redeploy.

**Follow-up**:
- [x] Configurar Custom Domain permanente `api.stackplus.com.br` — CNAME `api` → `kmse1wns.up.railway.app` + TXT `_railway-verify.api` gerenciado pelo Vercel DNS (nameservers `ns1/2.vercel-dns.com`). SSL Let's Encrypt auto-renovável. (21/04 noite)
- [x] Reconfigurar URL de webhook na ANNAPAY — `POST /api/banking/annapay/webhook/sync` com token ADMIN aponta pra `https://api.stackplus.com.br/api/banking/annapay/webhooks/cob`. (21/04 noite)
- [x] Pausar/remover o Cron Service falho — **CronSchedule deletado do Railway**. (21/04 noite)
- [x] Cleanup de refresh tokens vira execução manual semanal (documentada acima) até ter solução definitiva
- [ ] Revisar periodicamente Railway → stackplus-api → Source pra confirmar que continua apontando pro repo correto

### 2026-04-21 (continuação) — Env vars sujas sobreviveram à troca de Source

**Sintoma** (descoberto durante Opção 1 acima): após adicionar custom domain `api.stackplus.com.br`, `/health` respondia OK mas `POST /auth/login` retornava `{"error":"secretOrPrivateKey must have a value"}`. Frontend em "Credenciais inválidas" genérico.

**Causa raiz**: quando Source foi trocada de Docker (Evolution API hijacked) pra GitHub no incidente anterior, o Railway preservou **as env vars da source antiga** em vez de limpar. O serviço stackplus-api estava rodando com 18 variáveis da Evolution API (`AUTHENTICATION_API_KEY`, `CACHE_REDIS_*`, `DATABASE_PROVIDER`, `SERVER_TYPE`, `SERVER_URL`, etc.) e **sem as variáveis críticas do stackplus-api** (`JWT_SECRET`, `ANNAPAY_*`, `FRONTEND_URL`, `API_PUBLIC_URL`, `SANGEUR_WEBHOOK_SECRET`). Login funcionou pontualmente após o recovery porque `JWT_SECRET` foi criada manualmente pra virar ADMIN e sincronizar webhook, mas algum redeploy subsequente limpou.

**Ação**:
1. Recriei via Raw Editor do Railway todas as env vars do `.env.example` com valores de produção (`JWT_SECRET`, `JWT_EXPIRES_IN`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `NODE_ENV=production`, `FRONTEND_URL`, `API_PUBLIC_URL`, `EVOLUTION_API_*`, `ANNAPAY_*`, `SANGEUR_WEBHOOK_SECRET`).
2. Validei login via `curl` direto na API (200 OK com token) antes de testar no frontend.
3. Cleanup das 18 variáveis órfãs da Evolution API. Mantidas apenas `DATABASE_URL`, `EVOLUTION_INSTANCE_NAME`, `SENTRY_DSN` (nomes que coincidem com os que o stackplus-api espera).

**Lição aprendida**: **trocar Source no Railway NÃO limpa env vars da source antiga**. Depois de qualquer troca de Source (Docker ↔ GitHub, ou repo A ↔ repo B), fazer auditoria manual: abrir Variables e conferir que a lista bate com o `.env.example` do repo atual. Variáveis com nomes não reconhecidos pelo código novo devem ser removidas explicitamente.

**Sanity check pós-fix**:
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-RestMethod -Uri "https://api.stackplus.com.br/health" -Method Get

# Login via API
$body = @{ cpf = "CPF_ADMIN"; password = "SENHA" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.stackplus.com.br/api/auth/login" -Method Post -ContentType "application/json" -Body $body
```
