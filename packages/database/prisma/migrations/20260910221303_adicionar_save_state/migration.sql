-- AlterEnum
ALTER TYPE "SaveKind" ADD VALUE 'state';

-- DropIndex
DROP INDEX "user_saves_user_id_sha256_kind_key";

-- AlterTable
ALTER TABLE "user_saves" ADD COLUMN     "slot" INTEGER NOT NULL DEFAULT -1,
ADD COLUMN     "thumbnail_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_saves_user_id_sha256_kind_slot_key" ON "user_saves"("user_id", "sha256", "kind", "slot");

