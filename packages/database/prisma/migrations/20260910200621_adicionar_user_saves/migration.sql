-- CreateEnum
CREATE TYPE "SaveKind" AS ENUM ('sram');

-- CreateTable
CREATE TABLE "user_saves" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" "SaveKind" NOT NULL DEFAULT 'sram',
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_saves_user_id_idx" ON "user_saves"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_saves_user_id_sha256_kind_key" ON "user_saves"("user_id", "sha256", "kind");

-- AddForeignKey
ALTER TABLE "user_saves" ADD CONSTRAINT "user_saves_user_id_sha256_fkey" FOREIGN KEY ("user_id", "sha256") REFERENCES "user_roms"("user_id", "sha256") ON DELETE CASCADE ON UPDATE CASCADE;
