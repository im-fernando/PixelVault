-- CreateEnum
CREATE TYPE "SystemId" AS ENUM ('snes', 'nes', 'gb', 'gba', 'genesis');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems" (
    "id" "SystemId" NOT NULL,
    "name" TEXT NOT NULL,
    "core_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "system_id" "SystemId" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "release_year" INTEGER,
    "publisher" TEXT,
    "cover_url" TEXT,
    "is_homebrew" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_roms" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "region" TEXT,
    "revision" TEXT,
    "storage_key" TEXT,
    "size_bytes" INTEGER,

    CONSTRAINT "game_roms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roms" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_games" (
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "last_played_at" TIMESTAMP(3),
    "total_playtime_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_games_pkey" PRIMARY KEY ("user_id","game_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_system_id_idx" ON "games"("system_id");

-- CreateIndex
CREATE INDEX "games_is_homebrew_idx" ON "games"("is_homebrew");

-- CreateIndex
CREATE UNIQUE INDEX "game_roms_sha256_key" ON "game_roms"("sha256");

-- CreateIndex
CREATE INDEX "game_roms_game_id_idx" ON "game_roms"("game_id");

-- CreateIndex
CREATE INDEX "user_roms_user_id_idx" ON "user_roms"("user_id");

-- CreateIndex
CREATE INDEX "user_roms_game_id_idx" ON "user_roms"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roms_user_id_sha256_key" ON "user_roms"("user_id", "sha256");

-- CreateIndex
CREATE INDEX "user_games_user_id_last_played_at_idx" ON "user_games"("user_id", "last_played_at");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_roms" ADD CONSTRAINT "game_roms_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roms" ADD CONSTRAINT "user_roms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roms" ADD CONSTRAINT "user_roms_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
