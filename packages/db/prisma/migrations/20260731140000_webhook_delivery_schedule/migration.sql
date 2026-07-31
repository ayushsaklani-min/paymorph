ALTER TABLE "MerchantWebhookDelivery"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "MerchantWebhookDelivery_status_nextAttemptAt_idx"
  ON "MerchantWebhookDelivery"("status", "nextAttemptAt");
