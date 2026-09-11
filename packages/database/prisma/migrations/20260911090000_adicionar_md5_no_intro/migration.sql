-- AlterTable: sha256 vira nullable em game_roms — entradas importadas do
-- No-Intro não têm SHA-256, só MD5 (issue #134).
ALTER TABLE "game_roms" ALTER COLUMN "sha256" DROP NOT NULL;

-- AlterTable: novo hash em game_roms, o que o banco No-Intro cataloga.
ALTER TABLE "game_roms" ADD COLUMN "md5" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "game_roms_md5_key" ON "game_roms"("md5");

-- AlterTable: MD5 calculado na verificação do upload, para casar contra
-- game_roms.md5. Não é único: é dado auxiliar de reprocessamento, não
-- endereço de nada (ADR 0013 continua sendo sha256).
ALTER TABLE "user_roms" ADD COLUMN "md5" TEXT;
