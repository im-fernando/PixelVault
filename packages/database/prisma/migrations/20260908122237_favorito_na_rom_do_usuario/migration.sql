/*
  Warnings:

  - You are about to drop the column `is_favorite` on the `user_games` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_games" DROP COLUMN "is_favorite";

-- AlterTable
ALTER TABLE "user_roms" ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false;
