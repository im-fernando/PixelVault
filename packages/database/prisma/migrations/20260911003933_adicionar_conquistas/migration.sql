-- CreateEnum
CREATE TYPE "AchievementCode" AS ENUM ('primeira_rom_enviada', 'primeiro_save_state', 'primeira_sincronizacao', 'colecionista_bronze', 'colecionista_prata', 'colecionista_ouro', 'explorador_bronze', 'explorador_prata', 'explorador_ouro', 'dedicacao_bronze', 'dedicacao_prata', 'dedicacao_ouro');

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" "AchievementCode" NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_achievements_user_id_idx" ON "user_achievements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_user_id_code_key" ON "user_achievements"("user_id", "code");

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
