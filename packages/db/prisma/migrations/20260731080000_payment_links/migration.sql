CREATE TYPE "PaymentLinkMode" AS ENUM ('SINGLE_USE', 'REUSABLE');
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "PaymentLinkMode" NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultsJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "singleUseInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN "paymentLinkId" TEXT;

CREATE UNIQUE INDEX "PaymentLink_slug_key" ON "PaymentLink"("slug");
CREATE UNIQUE INDEX "PaymentLink_singleUseInvoiceId_key" ON "PaymentLink"("singleUseInvoiceId");
CREATE INDEX "PaymentLink_merchantId_createdAt_idx" ON "PaymentLink"("merchantId", "createdAt");
CREATE INDEX "PaymentLink_status_expiresAt_idx" ON "PaymentLink"("status", "expiresAt");
CREATE INDEX "Invoice_paymentLinkId_createdAt_idx" ON "Invoice"("paymentLinkId", "createdAt");

ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentLinkId_fkey"
  FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
