# StackPlus

Plataforma SaaS para gestão de home games de poker — cash games e torneios, com
controle de fichas, caixa, comandas, pagamentos PIX e fechamento automático.

**Um produto SX Poker.**

---

## Produto

- Landing page pública: [www.stackplus.com.br/lp](https://www.stackplus.com.br/lp)
- Aplicação principal: [www.stackplus.com.br](https://www.stackplus.com.br)

**Funcionalidades principais**

- Criação de home games com múltiplos formatos (cash / torneio / híbrido)
- Controle de buy-in, rebuy, add-on e cashout em tempo real
- Modo TV com timer, blinds, ranking e premiação
- Integração com Annapay para pagamentos PIX (in/out) automáticos
- Reconciliação bancária automática (extrato vs transações registradas)
- Módulo SANGEUR (caixa móvel) para venda de fichas à parte
- Relatórios financeiros e acerto final automático
- Multi-tenant por home game, com papéis (OWNER, COHOST, PLAYER)

---

## Arquitetura

```
┌─────────────────────┐           ┌─────────────────────┐
│   stackplus-web     │  HTTPS   │   stackplus-api     │
│   (Next.js 15)      │◀────────▶│   (Node/Express)    │
│   Vercel            │  WSS     │   Railway           │
└─────────────────────┘           └──────────┬──────────┘
                                             │
                                  ┌──────────┴──────────┐
                                  │   PostgreSQL        │
                                  │   Railway (managed) │
                                  └──────────┬──────────┘
                                             │ webhooks
                                  ┌──────────┴──────────┐
                                  │   Annapay (PIX)     │
                                  └─────────────────────┘
```

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router) · React 18 · TypeScript · Tailwind CSS · Zustand · socket.io-client |
| Backend | Node.js 20 · Express · TypeScript · socket.io · Prisma · Zod |
| Banco | PostgreSQL 15+ |
| Auth | JWT · bcrypt |
| Pagamentos | Annapay (PIX) |
| Deploy | Vercel (web) · Railway (api + db) |
| CI | GitHub Actions |
| Testes | Vitest |

---

## Estrutura do repositório

```
.
├── .github/workflows/     # CI (lint, typecheck, build, tests)
├── .claude/               # Agentes + comandos (ver CLAUDE.md)
├── stackplus-api/         # Backend Node/Express + Prisma
│   ├── src/
│   │   ├── modules/       # Domínios (auth, banking, cashier, comanda, homegame, ...)
│   │   ├── middlewares/   # auth, error, rate-limit
│   │   ├── lib/           # prisma, homegame-auth
│   │   └── server.ts      # entrypoint
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/    # migrations versionadas
│   │   └── seed.ts
│   └── tests/             # vitest suite (35 testes)
├── stackplus-web/         # Frontend Next.js
│   ├── app/               # rotas (App Router)
│   │   ├── lp/            # landing page
│   │   ├── homegame/      # gestão de home games
│   │   ├── tournament/    # torneios
│   │   ├── cashier/       # operação do caixa
│   │   ├── comanda/       # comandas (gestão + jogador)
│   │   ├── sangeur/       # caixa móvel
│   │   └── tv/            # modo TV
│   ├── components/
│   ├── hooks/
│   └── public/
├── CLAUDE.md              # Regras operacionais pra agentes AI
├── Dockerfile             # build do stackplus-api pra Railway
├── railway.toml           # config do Railway
└── README.md              # este arquivo
```

---

## Setup local

### Pré-requisitos

- Node.js 20+
- PostgreSQL 15+ rodando localmente (ou via Docker)
- Git

### Clonar e instalar

```powershell
git clone https://github.com/denaao/stackplus.git
cd stackplus
```

### Backend (stackplus-api)

```powershell
cd stackplus-api
cp .env.example .env
# edite .env com seu DATABASE_URL local + JWT_SECRET + credenciais Annapay (opcional pra dev)
npm install
npm run db:generate      # gera Prisma Client
npm run db:migrate       # aplica migrations no DB local
npm run db:seed          # popula com dados de teste (opcional)
npm run dev              # API em http://localhost:3001
```

### Frontend (stackplus-web)

Em outro terminal:

```powershell
cd stackplus-web
cp .env.local.example .env.local   # se existir; senão crie manualmente
npm install
npm run dev                         # app em http://localhost:3000
```

### Variáveis de ambiente mínimas

**stackplus-api/.env**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/stackplus
JWT_SECRET=qualquer-string-longa-pra-dev
JWT_EXPIRES_IN=7d
PORT=3001
FRONTEND_URL=http://localhost:3000
API_PUBLIC_URL=http://localhost:3001
NODE_ENV=development
# Annapay é opcional em dev — sem isso, charges PIX não funcionam mas o resto roda
```

**stackplus-web/.env.local**

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## Scripts principais

### stackplus-api

| Script | O que faz |
|---|---|
| `npm run dev` | Roda API em modo dev com hot reload (tsx watch) |
| `npm run build` | Compila TS pra `dist/` |
| `npm start` | Roda a versão compilada (`dist/server.js`) |
| `npm test` | Roda suíte Vitest |
| `npm run db:generate` | Gera Prisma Client a partir do schema |
| `npm run db:migrate` | Aplica migrations pendentes no DB local (cria nova migration se houver diff) |
| `npm run db:deploy` | Aplica migrations em produção (roda automaticamente no container Railway) |
| `npm run db:seed` | Popula o banco com fixtures de teste |
| `npm run db:studio` | Abre Prisma Studio (UI pra visualizar o DB) |

### stackplus-web

| Script | O que faz |
|---|---|
| `npm run dev` | Roda Next dev server |
| `npm run build` | Build de produção |
| `npm start` | Serve o build |
| `npm run lint` | ESLint (Next config) |

---

## Deploy

### Fluxo

1. Commit e push pra `main`
2. **GitHub Actions** roda: lint + typecheck + build + testes em ambos sub-projetos
3. Em paralelo:
   - **Vercel** builda e deploya `stackplus-web` (push → deploy automático)
   - **Railway** builda imagem Docker de `stackplus-api` e sobe novo container
4. Container Railway roda `npx prisma migrate deploy` no start, aplicando migrations pendentes antes de atender requests
5. Deploy live em ~2-4 minutos

**Não há staging separado** — `main` é produção. Mudanças sensíveis (schema, auth,
banking) são mitigadas com: testes no CI, migrations com rollback, feature flags via env var.

### Infraestrutura

| Componente | Plataforma | Config |
|---|---|---|
| Web | Vercel | `stackplus-web/vercel.json` |
| API | Railway | `Dockerfile` + `railway.toml` |
| DB | Railway Postgres (managed) | Snapshots automáticos |
| DNS | Cloudflare + registro próprio | |

---

## Segurança e integridade

- **Rate limit** em `/auth/login` (5/15min) e `/auth/register` (3/hora) por IP
- **Webhook Annapay** validado com timing-safe secret compare + idempotency atômica via UPDATE condicional
- **Auth JWT** (7d), middleware em rotas protegidas
- **Tenant isolation** via `isHomeGameHost` em rotas gerenciais
- **CHECK constraints** no banco pra prevenir valores negativos em campos financeiros
- **CI obrigatório** antes de merge (lint, typecheck, build, testes)

---

## Agentes AI e automação

Este repo usa um sistema de agentes especialistas pra implementar features com
supervisão (Universal Production AI Agent Orchestrator).

Leia `CLAUDE.md` na raiz para:

- Regras de classificação de tarefa (LOW / MEDIUM / HIGH risk)
- Mandatory escalation para auth, schema, RLS, payments, security
- Convenções de resposta e execução segura
- Comandos operacionais em `.claude/commands/`

---

## Contribuindo

- Abra uma issue descrevendo o problema ou sugestão
- Branch da `main`, nome descritivo (ex: `fix/webhook-idempotency`)
- Commit message seguindo convenção: `type(scope): message` (ex: `feat(auth): ...`, `fix(banking): ...`)
- Garanta que o CI passa antes de abrir PR
- PRs com mudança em migration, auth, banking ou schema passam por review extra

---

## Licença

Proprietária. Uso interno SX Poker / StackPlus. Contate os mantenedores para dúvidas.
