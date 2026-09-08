-- CreateEnum
CREATE TYPE "AuthAttemptKey" AS ENUM ('ip', 'identifier');

-- CreateEnum
CREATE TYPE "AuthAttemptScope" AS ENUM ('login', 'register', 'change_password');

-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" UUID NOT NULL,
    "scope" "AuthAttemptScope" NOT NULL,
    "key_type" "AuthAttemptKey" NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_scope_key_type_key_hash_created_at_idx" ON "auth_attempts"("scope", "key_type", "key_hash", "created_at");

-- CreateIndex
CREATE INDEX "auth_attempts_created_at_idx" ON "auth_attempts"("created_at");
