-- DATA-003: CHECK constraints em valores financeiros.
-- Valor negativo em qualquer campo monetário é inválido do ponto de vista do
-- negócio. Zero é permitido (ex: CASHOUT com busto, ajustes).
-- Se alguma constraint falhar ao aplicar, indica dado corrompido pré-existente
-- que precisa limpeza manual antes.
--
-- bankBalance NÃO tem constraint porque o sistema pode permitir saldo negativo
-- temporariamente (host paga antes do PIX entrar). Se a regra mudar, adicionar.

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_nonneg" CHECK ("amount" >= 0),
  ADD CONSTRAINT "Transaction_chips_nonneg" CHECK ("chips" >= 0);

ALTER TABLE "SangeurSale"
  ADD CONSTRAINT "SangeurSale_amount_nonneg" CHECK ("amount" >= 0),
  ADD CONSTRAINT "SangeurSale_chips_nonneg" CHECK ("chips" >= 0),
  ADD CONSTRAINT "SangeurSale_chipValue_nonneg" CHECK ("chipValue" >= 0);

ALTER TABLE "HomeGameBankTransaction"
  ADD CONSTRAINT "HomeGameBankTransaction_amount_nonneg" CHECK ("amount" >= 0);

ALTER TABLE "PrepaidChargePending"
  ADD CONSTRAINT "PrepaidChargePending_amount_nonneg" CHECK ("amount" >= 0),
  ADD CONSTRAINT "PrepaidChargePending_chips_nonneg" CHECK ("chips" >= 0);

ALTER TABLE "ComandaItem"
  ADD CONSTRAINT "ComandaItem_amount_nonneg" CHECK ("amount" >= 0);
