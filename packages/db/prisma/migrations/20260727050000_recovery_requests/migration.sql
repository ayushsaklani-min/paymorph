ALTER TYPE "JobType" ADD VALUE 'VALIDATE_RECOVERY_XRPL' AFTER 'VALIDATE_XRPL';
ALTER TYPE "JobType" ADD VALUE 'REQUEST_RECOVERY_FDC' AFTER 'VALIDATE_RECOVERY_XRPL';

CREATE TYPE "RecoveryRequestStatus" AS ENUM (
    'PREPARED',
    'SUBMITTED',
    'XRPL_SIGNED',
    'XRPL_VALIDATED',
    'FAILED'
);

CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "status" "RecoveryRequestStatus" NOT NULL DEFAULT 'PREPARED',
    "requestJson" JSONB NOT NULL,
    "diagnosisJson" JSONB NOT NULL,
    "providerPayloadUuid" TEXT,
    "xrplTxHash" TEXT,
    "xrplLedgerIndex" BIGINT,
    "xrplValidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryRequest_providerPayloadUuid_key"
ON "RecoveryRequest"("providerPayloadUuid");

CREATE UNIQUE INDEX "RecoveryRequest_xrplTxHash_key"
ON "RecoveryRequest"("xrplTxHash");

CREATE UNIQUE INDEX "RecoveryRequest_attemptId_generation_key"
ON "RecoveryRequest"("attemptId", "generation");

CREATE INDEX "RecoveryRequest_status_updatedAt_idx"
ON "RecoveryRequest"("status", "updatedAt");

ALTER TABLE "RecoveryRequest"
ADD CONSTRAINT "RecoveryRequest_attemptId_fkey"
FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PaymentAttempt_recoveryTxHash_key"
ON "PaymentAttempt"("recoveryTxHash");
