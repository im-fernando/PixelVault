INSERT INTO "systems" ("id", "name", "core_slug") VALUES ('ps1', 'PlayStation', 'pcsx_rearmed')
ON CONFLICT ("id") DO NOTHING;
