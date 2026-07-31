CREATE TABLE "MerchantWebhookDelivery" (
  "id" TEXT NOT NULL, "merchantId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "deliveredAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantWebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MerchantWebhookDelivery_merchantId_createdAt_idx" ON "MerchantWebhookDelivery"("merchantId", "createdAt");
CREATE INDEX "MerchantWebhookDelivery_status_createdAt_idx" ON "MerchantWebhookDelivery"("status", "createdAt");
ALTER TABLE "MerchantWebhookDelivery" ADD CONSTRAINT "MerchantWebhookDelivery_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
