-- CreateEnum
CREATE TYPE "FdcRequestStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "FlareSubmissionStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'REPLACED', 'REVERTED');

-- AlterTable
ALTER TABLE "Quote"
  ADD COLUMN "ftsoFeedId" TEXT,
  ADD COLUMN "serviceFeeBps" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "directMintFeeBips" DECIMAL(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN "directMintMinimumFeeUBA" DECIMAL(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN "assetManagerAddress" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "fxrpAddress" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "settlementDeadline" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Quote"
  ALTER COLUMN "serviceFeeBps" DROP DEFAULT,
  ALTER COLUMN "directMintFeeBips" DROP DEFAULT,
  ALTER COLUMN "directMintMinimumFeeUBA" DROP DEFAULT,
  ALTER COLUMN "assetManagerAddress" DROP DEFAULT,
  ALTER COLUMN "fxrpAddress" DROP DEFAULT,
  ALTER COLUMN "settlementDeadline" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentAttempt"
  ADD COLUMN "xrplLastLedgerSequence" BIGINT,
  ADD COLUMN "xrplValidatedAt" TIMESTAMP(3),
  ADD COLUMN "flareSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FdcRequest" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "status" "FdcRequestStatus" NOT NULL DEFAULT 'PREPARED',
  "requestBytes" TEXT NOT NULL,
  "verifierRequest" JSONB NOT NULL,
  "votingRoundId" BIGINT,
  "proofJson" JSONB,
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FdcRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlareSubmission" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "transactionHash" TEXT NOT NULL,
  "nonce" BIGINT NOT NULL,
  "status" "FlareSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "replacementForHash" TEXT,
  "receiptJson" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "FlareSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FdcRequest_attemptId_key" ON "FdcRequest"("attemptId");
CREATE INDEX "FdcRequest_status_updatedAt_idx" ON "FdcRequest"("status", "updatedAt");
CREATE UNIQUE INDEX "FlareSubmission_transactionHash_key" ON "FlareSubmission"("transactionHash");
CREATE INDEX "FlareSubmission_attemptId_submittedAt_idx" ON "FlareSubmission"("attemptId", "submittedAt");

-- AddForeignKey
ALTER TABLE "FdcRequest"
  ADD CONSTRAINT "FdcRequest_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlareSubmission"
  ADD CONSTRAINT "FlareSubmission_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
