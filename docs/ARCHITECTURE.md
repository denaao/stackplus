# StackPlus — Arquitetura

Visão geral do sistema, componentes, fluxos críticos e modelo de dados.
Diagramas em [Mermaid](https://mermaid.js.org/) — GitHub renderiza inline.

## Visão geral (deploy)

```mermaid
flowchart LR
    User((Usuário))
    Sangeur((Sangeur))
    ANNAPAY[ANNAPAY API<br/>PIX banking]

    User -->|HTTPS| Web
    Sangeur -->|HTTPS| Web
    Web -->|REST + Socket.io| API
    API -->|SQL| DB[(Postgres 15)]
    API <-->|PIX charges| ANNAPAY
    ANNAPAY -.webhook.-> API

    subgraph Vercel
        Web[stackplus-web<br/>Next.js 15 App Router]
    end

    subgraph Railway
        API[stackplus-api<br/>Node 20 + Express + Prisma]
        DB
    end
```

**Stack:**
- **Frontend**: Next.js 15 (App Router), React 18, TypeScript, Tailwind, Zustand, socket.io-client → deploy na Vercel
- **Backend**: Node 20, Express, Prisma 5, socket.io → deploy na Railway com Nixpacks
- **Database**: PostgreSQL 15+ (Railway managed)
- **Banking**: ANNAPAY (PIX in/out + webhook de liquidação)
- **Auth**: JWT single-token (refresh token pendente — ver SEC-004)
- **Observabilidade**: pino structured logs com `requestId` correlation

---

## Módulos do backend

```mermaid
flowchart TB
    subgraph Core
        auth[auth]
        users[users]
        homegame[homegame]
    end

    subgraph Operacional
        session[session]
        cashier[cashier]
        tournament[tournament]
        comanda[comanda]
    end

    subgraph Financeiro
        banking[banking<br/>ANNAPAY]
    end

    subgraph Complementar
        sangeur[sangeur]
        ranking[ranking]
        groups[groups]
    end

    auth --> users
    homegame --> users
    session --> homegame
    tournament --> homegame
    cashier --> session
    cashier --> comanda
    sangeur --> session
    sangeur --> comanda
    tournament --> comanda
    comanda --> banking
    session --> comanda
    ranking --> session
```

Onde cada módulo está em `stackplus-api/src/modules/<nome>/`.

---

## Fluxo crítico: PIX prepaid (compra de ficha)

Cenário: home game em modo PREPAID — jogador paga via PIX antes de receber fichas.

```mermaid
sequenceDiagram
    actor Op as Operador (caixa)
    participant Web as stackplus-web
    participant API as stackplus-api
    participant ANN as ANNAPAY
    participant DB as Postgres

    Op->>Web: Registrar BUYIN (modo PREPAID)
    Web->>API: POST /cashier/transaction
    API->>ANN: Create COB (PIX charge)
    ANN-->>API: { chargeId, QR code }
    API->>DB: INSERT PrepaidChargePending<br/>(status=PENDING, @unique chargeId)
    API-->>Web: { requiresCharge, charge }
    Web-->>Op: Mostra QR code ao jogador

    actor Player as Jogador
    Player->>ANN: Paga PIX (app do banco)

    par Webhook (push)
        ANN->>API: POST /banking/annapay/webhook<br/>(x-annapay-webhook-secret)
        API->>API: safeCompareSecrets (timing-safe)
        API->>DB: UPDATE charge PENDING → PROCESSING<br/>(atomic lock, idempotente)
        API->>DB: INSERT Transaction (BUYIN)
        API->>DB: UPDATE PlayerSessionState
        API-->>Web: socket.io transaction:new
    and Polling (pull, fallback)
        Web->>API: POST /prepaid/settle (a cada 5s)
        API->>ANN: GET /cob/:id
        ANN-->>API: status=CONCLUIDA
        API->>DB: idem acima (com lock atomic)
    end

    API-->>Web: socket.io: confirmação
    Web-->>Op: "Compra registrada"
```

**Pontos críticos de segurança (SEC-001, SEC-006):**
- Webhook valida secret com `crypto.timingSafeEqual` — mitiga timing attacks
- Sem header → 200 (healthcheck-friendly). Header errado → 401 + log warn
- UPDATE conditional `PENDING → PROCESSING` serve de lock atômico — webhook e polling concorrentes não geram double-settle
- `@unique chargeId` na `PrepaidChargePending` garante idempotência

---

## Fluxo crítico: fechamento de sessão (cash game)

```mermaid
sequenceDiagram
    actor Host
    participant Web as stackplus-web
    participant API as stackplus-api
    participant DB as Postgres

    Host->>Web: Encerrar sessão
    Web->>API: POST /sessions/:id/finish
    API->>DB: BEGIN TRANSACTION
    API->>DB: UPDATE Session.status=FINISHED
    loop Para cada staff
        API->>DB: INSERT ComandaItem (STAFF_CAIXINHA)
    end
    loop Para cada rakeback
        API->>DB: INSERT ComandaItem (STAFF_RAKEBACK)
    end
    API->>DB: COMMIT
    API-->>Web: Sessão fechada
    Web->>API: GET /banking/annapay/report/:sessionId
    API->>API: Calcula PIX in/out pendentes
    API-->>Web: Relatório financeiro
```

---

## Modelo de dados (essencial)

```mermaid
erDiagram
    User ||--o{ HomeGameMember : "pertence a"
    User ||--o{ HomeGame : "hosta"
    User ||--o{ Transaction : "registra"
    HomeGame ||--o{ HomeGameMember : "tem membros"
    HomeGame ||--o{ Session : "contém"
    HomeGame ||--o{ Tournament : "contém"
    HomeGame ||--o{ Comanda : "tem"
    Session ||--o{ Transaction : "registra"
    Session ||--o{ PlayerSessionState : "tem estado"
    Session ||--o{ SessionParticipant : "tem participantes"
    Tournament ||--o{ TournamentPlayer : "tem"
    TournamentPlayer }o--|| Comanda : "vincula a"
    Comanda ||--o{ ComandaItem : "tem itens"
    Comanda ||--o{ HomeGameBankTransaction : "gera movimento"
    User ||--o{ AuditLog : "é sujeito de"

    User {
        uuid id PK
        string cpf UK
        string email UK
        string passwordHash
        enum role "PLAYER|ADMIN"
    }
    HomeGame {
        uuid id PK
        uuid hostId FK
        enum financialModule "POSTPAID|PREPAID|HYBRID"
        decimal bankBalance
    }
    Session {
        uuid id PK
        uuid homeGameId FK
        enum status "WAITING|ACTIVE|FINISHED"
        decimal chipValue
    }
    Transaction {
        uuid id PK
        uuid sessionId FK
        uuid userId FK
        enum type "BUYIN|REBUY|ADDON|CASHOUT|JACKPOT"
        decimal amount
        string origin "C=cashier|S=sangeur"
    }
    Comanda {
        uuid id PK
        uuid playerId FK
        enum status "OPEN|CLOSED"
        enum mode "PREPAID|POSTPAID"
        decimal balance
    }
    ComandaItem {
        uuid id PK
        uuid comandaId FK
        enum type "22 tipos: CASH_*, PAYMENT_*, TRANSFER_*, STAFF_*, TOURNAMENT_*"
        decimal amount
    }
```

**Principais enums:**
- `TransactionType`: BUYIN, REBUY, ADDON, CASHOUT, JACKPOT
- `ComandaItemType`: CASH_BUYIN, CASH_REBUY, CASH_ADDON, CASH_CASHOUT, TOURNAMENT_BUYIN, ..., PAYMENT_PIX_SPOT, PAYMENT_CASH, TRANSFER_IN, CARRY_IN, STAFF_CAIXINHA, STAFF_RAKEBACK, etc.
- `FinancialModule`: POSTPAID (fichas fiadas), PREPAID (paga antes), HYBRID (membro escolhe)

---

## Segurança & compliance

| Área | Estado | Onde |
|------|--------|------|
| JWT auth | ✅ | `src/middlewares/auth.middleware.ts` |
| Refresh token | ❌ pendente | SEC-004 |
| Rate limit (login/register) | ✅ | `src/middlewares/rate-limit.middleware.ts` |
| Webhook secret (ANNAPAY) | ✅ timing-safe | `src/modules/banking/annapay.controller.ts` |
| Idempotência de charge | ✅ atomic lock | `@unique chargeId` + UPDATE conditional |
| Audit log | ✅ | `src/lib/audit.ts` — DELETE tx/session/homegame, PIX out, role change |
| CPF/password rules | ✅ | `src/utils/password.ts` + checks no auth controller |
| Request correlation | ✅ | `pino-http` + `x-request-id` |

---

## Decisões arquiteturais não-óbvias

1. **Comanda como ledger universal** — toda movimentação financeira de um jogador (buy-in, cash-out, pagamento PIX, prêmio, rakeback, caixinha) vira um `ComandaItem`. Isso centraliza saldo e histórico num único lugar. O `Transaction` do caixa espelha o `ComandaItem` do buy-in pra preservar auditoria operacional.

2. **`Transaction.origin` em vez de FK direta pro registrador** — quando a DATA-001 Deploy A foi aplicada, o campo `registeredBy` passou a gravar `userId` puro, com o `origin` ('C' pra cashier, 'S' pra sangeur) indicando a rota. Isso evita precisar de polimorfismo/union types no Prisma. FK está bloqueada pelo Deploy B (aguardando estabilidade).

3. **PIX: webhook + polling** — ANNAPAY manda webhook, mas rede é não confiável. Polling a cada 5s pelo frontend serve de failsafe. O `UPDATE conditional PENDING→PROCESSING` como lock atômico impede double-settle mesmo quando os dois chegam juntos.

4. **Mount truncation workaround** — ver `docs/TRUNCATION-BUG.md`. Task #17 fechada mas bug de infra permanece intermitente; `scripts/check-truncation.ps1` é o guardião recomendado antes de commits.

---

## Links de referência

- `stackplus-api/prisma/schema.prisma` — schema completo (fonte da verdade do modelo)
- `stackplus-api/src/modules/banking/annapay.service.ts` — integração PIX completa
- `stackplus-api/src/modules/comanda/comanda.service.ts` — ledger engine
- `stackplus-api/tests/modules/` — testes de idempotência, reconciliação, rakeback
- `docs/TRUNCATION-BUG.md` — Task #17 (investigação do bug do mount)
