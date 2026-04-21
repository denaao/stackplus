-- PERF: indices adicionais em queries quentes.
--
-- Origem: auditoria das queries mais frequentes no codebase (comanda cashbox,
-- listagem de home game, reconcile, ranking cross-session). Todos sao
-- aditivos — so aceleram, nao mudam comportamento.
--
-- Criados com CONCURRENTLY pra nao segurar tabelas em prod durante deploy.
-- IF NOT EXISTS torna a migration idempotente (re-run safe).

-- Comanda: listagem "todas as comandas do home game filtradas por status".
CREATE INDEX IF NOT EXISTS "Comanda_homeGameId_status_idx"
  ON "Comanda"("homeGameId", "status");

-- ComandaItem: cashbox filtra itens por createdAt range (periodo do relatorio).
CREATE INDEX IF NOT EXISTS "ComandaItem_createdAt_idx"
  ON "ComandaItem"("createdAt");

-- ComandaItem: load de comanda busca itens pendentes especificamente.
CREATE INDEX IF NOT EXISTS "ComandaItem_comandaId_paymentStatus_idx"
  ON "ComandaItem"("comandaId", "paymentStatus");

-- ComandaItem: reconcile global (status=PAID, type IN PIX_SPOT/PIX_TERM/TRANSFER_OUT).
CREATE INDEX IF NOT EXISTS "ComandaItem_paymentStatus_type_idx"
  ON "ComandaItem"("paymentStatus", "type");

-- Transaction: historico do jogador cross-session (ranking global, stats).
CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx"
  ON "Transaction"("userId", "createdAt");
