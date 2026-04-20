-- DATA-005: remove tabelas órfãs WhatsApp.
-- Feature foi descontinuada no commit "chore: remove WhatsApp/Evolution integration"
-- mas as tabelas e enums ficaram no schema sem uso. Esta migration limpa.

-- Drop em ordem (MessageLog tem FK pra InstanceConfig)
DROP TABLE IF EXISTS "WhatsAppMessageLog";
DROP TABLE IF EXISTS "WhatsAppInstanceConfig";

-- Enums exclusivos dessas tabelas
DROP TYPE IF EXISTS "WhatsAppMessageStatus";
DROP TYPE IF EXISTS "WhatsAppMessageDirection";
DROP TYPE IF EXISTS "WhatsAppInstanceStatus";
DROP TYPE IF EXISTS "WhatsAppProvider";
