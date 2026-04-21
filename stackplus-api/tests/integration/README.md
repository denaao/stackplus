# Testes de integração

Testes que rodam o **app Express real** contra um **Postgres real** de teste,
via `supertest`. Valida o contrato HTTP + efeitos colaterais no DB que
unit tests mockados não pegam.

## Como rodar localmente

1. Sobe um Postgres de teste (porta diferente do dev pra não conflitar):

   ```bash
   docker run --rm --name stackplus-pg-test \
     -e POSTGRES_PASSWORD=test \
     -e POSTGRES_DB=stackplus_test \
     -p 5433:5432 -d postgres:15
   ```

2. Define a env var:

   ```bash
   # .env.local ou export direto
   DATABASE_URL_TEST="postgresql://postgres:test@localhost:5433/stackplus_test"
   ```

3. Roda:

   ```bash
   # Primeiro run aplica migrations automaticamente.
   npm test -- integration
   ```

## Sem Postgres?

Se `DATABASE_URL_TEST` não estiver definida, os testes **são skippados**
(não falham). Isso permite `npm test` rodar em CI simples ou local sem
Postgres sem quebrar pipeline.

Pra ver quantos testes foram skippados:
```
 Test Files  9 passed (9)
      Tests  60 passed | X skipped
```

## Arquivos

- `setup.ts` — conexão + migrations + helpers de limpeza (TRUNCATE entre testes).
- `fixtures.ts` — factories (`createUser`, `createHomeGame`, `createSession`, etc).
- `*.integration.test.ts` — suites por domínio.

## Convenções

- **beforeEach**: `resetTestDatabase()` — dados zerados entre casos.
- **Import do app**: dinâmico dentro do `beforeAll` depois de setar
  `process.env.DATABASE_URL` pra garantir que o Prisma client conecte no DB certo.
- **IDs**: sempre UUID gerado pelo fixture — não passar IDs hardcoded.
- **CPFs**: counter sequencial no fixture pra evitar conflito de unique.
- **Tokens**: use `signToken(...)` direto em vez de fazer login em cada teste
  (mais rápido, menos IO). Só use `/auth/login` quando o teste FOR sobre login.

## Escopo

Hoje cobre (~20 casos):
- **auth.integration**: register, login, refresh (rotação), logout (revogação), reuso de token revogado, /me com/sem auth.
- **cashier.integration**: buy-in cria Transaction+State+ComandaItem, buy-in+cashout fecha estado, duplo cashout rejeitado, GET filtros, auth obrigatória.

Falta (backlog):
- Comanda open/close + pix-charge (mock ANNAPAY)
- Tournament register + eliminate + payout
- Sangeur shift open/close
- Session finish + rakeback + caixinha
