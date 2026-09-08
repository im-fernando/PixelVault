-- Papel da conta, para a autorização com CASL (issue #48).
--
-- Dois valores só: `user` e `admin`. O produto não tem moderação nem time, e
-- papel que ninguém usa vira permissão esquecida — quando a necessidade
-- existir, ela entra junto com a regra que a justifica.
--
-- O padrão é `user` e a coluna nasce NOT NULL na mesma instrução: o DEFAULT
-- preenche as linhas que já existiam, então a migration é replayável em banco
-- com dados. Nenhum caminho de aplicação promove alguém a `admin` — a
-- promoção é manual e deliberada.
CREATE TYPE "Role" AS ENUM ('user', 'admin');

ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'user';
