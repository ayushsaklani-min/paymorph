CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL, "merchantId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL, "secretHash" TEXT NOT NULL, "scopesJson" JSONB NOT NULL,
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE', "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_secretHash_key" ON "ApiKey"("secretHash");
CREATE INDEX "ApiKey_merchantId_createdAt_idx" ON "ApiKey"("merchantId", "createdAt");
CREATE INDEX "ApiKey_status_expiresAt_idx" ON "ApiKey"("status", "expiresAt");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
