-- CreateIndex
CREATE INDEX "user_games_game_id_total_playtime_seconds_idx" ON "user_games"("game_id", "total_playtime_seconds");
