CREATE TABLE "PaymentLinkAnalyticsEvent" (
  "id" TEXT NOT NULL, "paymentLinkId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentLinkAnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentLinkAnalyticsEvent_paymentLinkId_eventType_eventKey_key" ON "PaymentLinkAnalyticsEvent"("paymentLinkId", "eventType", "eventKey");
CREATE INDEX "PaymentLinkAnalyticsEvent_paymentLinkId_createdAt_idx" ON "PaymentLinkAnalyticsEvent"("paymentLinkId", "createdAt");
ALTER TABLE "PaymentLinkAnalyticsEvent" ADD CONSTRAINT "PaymentLinkAnalyticsEvent_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
