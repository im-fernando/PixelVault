-- Aceite dos termos de uso: exigência de LGPD, o consentimento precisa ser
-- demonstrável desde o primeiro usuário. Ver issue #45.
--
-- A coluna nasce anulável só para o tempo do backfill. Nenhum ambiente real
-- tem usuário anterior a esta migration (o cadastro nasce junto com ela), mas
-- bancos de desenvolvimento têm linhas soltas — e uma migration que quebra
-- quando a tabela não está vazia não é replayável.
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);

UPDATE "users" SET "terms_accepted_at" = "created_at" WHERE "terms_accepted_at" IS NULL;

ALTER TABLE "users" ALTER COLUMN "terms_accepted_at" SET NOT NULL;
