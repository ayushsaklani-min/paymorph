CREATE TYPE "RecoveryFdcStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'PENDING', 'READY', 'FAILED');
CREATE TYPE "RecoveryExecutionStage" AS ENUM ('MARKER', 'ORIGINAL');
CREATE TYPE "RecoveryExecutionStatus" AS ENUM ('RESERVED', 'SUBMITTED', 'DELAYED', 'CONFIRMED', 'FAILED');

CREATE TABLE "RecoveryFdcRequest" (
  "id" TEXT NOT NULL,
  "recoveryRequestId" TEXT NOT NULL,
  "status" "RecoveryFdcStatus" NOT NULL DEFAULT 'PREPARED',
  "requestBytes" TEXT NOT NULL,
  "verifierRequest" JSONB NOT NULL,
  "votingRoundId" BIGINT,
  "proofJson" JSONB,
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryFdcRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryExecution" (
  "id" TEXT NOT NULL,
  "recoveryRequestId" TEXT NOT NULL,
  "stage" "RecoveryExecutionStage" NOT NULL,
  "executionGeneration" INTEGER NOT NULL DEFAULT 0,
  "status" "RecoveryExecutionStatus" NOT NULL DEFAULT 'RESERVED',
  "nonceReservationId" TEXT,
  "transactionHash" TEXT,
  "receiptJson" JSONB,
  "evidenceJson" JSONB,
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryFdcRequest_recoveryRequestId_key"
  ON "RecoveryFdcRequest"("recoveryRequestId");
CREATE INDEX "RecoveryFdcRequest_status_updatedAt_idx"
  ON "RecoveryFdcRequest"("status", "updatedAt");
CREATE UNIQUE INDEX "RecoveryExecution_nonceReservationId_key"
  ON "RecoveryExecution"("nonceReservationId");
CREATE UNIQUE INDEX "RecoveryExecution_transactionHash_key"
  ON "RecoveryExecution"("transactionHash");
CREATE UNIQUE INDEX "RecoveryExecution_recoveryRequestId_stage_executionGeneration_key"
  ON "RecoveryExecution"("recoveryRequestId", "stage", "executionGeneration");
CREATE INDEX "RecoveryExecution_status_updatedAt_idx"
  ON "RecoveryExecution"("status", "updatedAt");

ALTER TABLE "RecoveryFdcRequest"
  ADD CONSTRAINT "RecoveryFdcRequest_recoveryRequestId_fkey"
  FOREIGN KEY ("recoveryRequestId") REFERENCES "RecoveryRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryExecution"
  ADD CONSTRAINT "RecoveryExecution_recoveryRequestId_fkey"
  FOREIGN KEY ("recoveryRequestId") REFERENCES "RecoveryRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryExecution"
  ADD CONSTRAINT "RecoveryExecution_nonceReservationId_fkey"
  FOREIGN KEY ("nonceReservationId") REFERENCES "ExecutorNonceReservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
