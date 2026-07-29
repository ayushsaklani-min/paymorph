-- Durable executor EOA nonce identity. Provider reads happen before this
-- reservation transaction; the database only arbitrates concurrent workers.
CREATE TABLE "ExecutorNonceReservation" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0,
  "chainId" TEXT NOT NULL,
  "executorAddress" TEXT NOT NULL,
  "nonce" BIGINT NOT NULL,
  "transactionHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExecutorNonceReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExecutorNonceReservation_attemptId_generation_key"
  ON "ExecutorNonceReservation"("attemptId", "generation");
CREATE UNIQUE INDEX "ExecutorNonceReservation_chainId_executorAddress_nonce_key"
  ON "ExecutorNonceReservation"("chainId", "executorAddress", "nonce");
CREATE INDEX "ExecutorNonceReservation_chainId_executorAddress_createdAt_idx"
  ON "ExecutorNonceReservation"("chainId", "executorAddress", "createdAt");

ALTER TABLE "ExecutorNonceReservation"
  ADD CONSTRAINT "ExecutorNonceReservation_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
