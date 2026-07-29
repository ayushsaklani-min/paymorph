ALTER TABLE "PayerSession"
ADD COLUMN "invoiceId" TEXT NOT NULL,
ADD COLUMN "network" TEXT NOT NULL;

ALTER TABLE "XamanPayload"
ADD COLUMN "websocketUrl" TEXT;

CREATE INDEX "PayerSession_invoiceId_expiresAt_idx"
ON "PayerSession"("invoiceId", "expiresAt");

ALTER TABLE "PayerSession"
ADD CONSTRAINT "PayerSession_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
