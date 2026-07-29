-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Denomination" AS ENUM ('XRP', 'USD');

-- CreateEnum
CREATE TYPE "SettlementAsset" AS ENUM ('FXRP', 'USDT0');

-- CreateEnum
CREATE TYPE "PayloadKind" AS ENUM ('SIGN_IN', 'PAYMENT', 'RECOVERY');

-- CreateEnum
CREATE TYPE "PayloadStatus" AS ENUM ('CREATED', 'OPENED', 'SIGNED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('CREATED', 'IDENTIFYING', 'IDENTIFIED', 'QUOTED', 'XAMAN_CREATED', 'AWAITING_SIGNATURE', 'XRPL_SIGNED', 'XRPL_VALIDATED', 'USEROP_UPLOADED', 'FDC_REQUESTED', 'FDC_READY', 'FLARE_SUBMITTED', 'FLARE_CONFIRMED', 'SETTLED', 'REJECTED', 'QUOTE_EXPIRED', 'XRPL_FAILED', 'EXECUTION_REVERTED', 'RECOVERY_REQUIRED', 'RECOVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('VALIDATE_XRPL', 'REQUEST_FDC', 'SUBMIT_FLARE', 'INDEX_EVENTS', 'RECONCILE', 'RECOVERY_DIAGNOSIS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('READY', 'RUNNING', 'RETRY', 'SUCCEEDED', 'DEAD');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "defaultAsset" "SettlementAsset" NOT NULL DEFAULT 'FXRP',
    "webhookUrl" TEXT,
    "webhookSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "externalRef" TEXT,
    "denomination" "Denomination" NOT NULL,
    "amountBaseUnits" DECIMAL(78,0) NOT NULL,
    "settlementAsset" "SettlementAsset" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRecipient" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "bps" INTEGER NOT NULL,

    CONSTRAINT "InvoiceRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerSession" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "xrplAccount" TEXT,
    "xamanUserTokenEnc" TEXT,
    "signInPayloadId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "payerXrplAccount" TEXT NOT NULL,
    "personalAccount" TEXT NOT NULL,
    "personalAccountNonce" DECIMAL(78,0) NOT NULL,
    "xrpUsdValue" DECIMAL(78,0),
    "xrpUsdDecimals" INTEGER,
    "xrpUsdTimestamp" TIMESTAMP(3),
    "invoiceOutBaseUnits" DECIMAL(78,0) NOT NULL,
    "serviceFeeOutBaseUnits" DECIMAL(78,0) NOT NULL,
    "maxFxrpInputUBA" DECIMAL(78,0) NOT NULL,
    "protocolMintFeeUBA" DECIMAL(78,0) NOT NULL,
    "executorFeeUBA" DECIMAL(78,0) NOT NULL,
    "xrplPaymentDrops" DECIMAL(78,0) NOT NULL,
    "slippageBps" INTEGER NOT NULL,
    "route" TEXT NOT NULL,
    "poolFee" INTEGER,
    "userOpHash" TEXT NOT NULL,
    "userOpDataEnc" TEXT NOT NULL,
    "memoHex" TEXT NOT NULL,
    "directMintAddress" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "payerSessionId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'CREATED',
    "payerXrplAccount" TEXT NOT NULL,
    "personalAccount" TEXT NOT NULL,
    "xamanPayloadUuid" TEXT,
    "xrplTxHash" TEXT,
    "xrplLedgerIndex" BIGINT,
    "flareTxHash" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "recoveryTxHash" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XamanPayload" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT,
    "payerSessionId" TEXT,
    "kind" "PayloadKind" NOT NULL,
    "payloadUuid" TEXT NOT NULL,
    "status" "PayloadStatus" NOT NULL DEFAULT 'CREATED',
    "qrPngUrl" TEXT,
    "deeplinkUrl" TEXT,
    "txId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XamanPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutorJob" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'READY',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 12,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "eventName" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "headersJson" JSONB NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "routerAddress" TEXT NOT NULL,
    "adapterAddress" TEXT NOT NULL,
    "fxrpAddress" TEXT NOT NULL,
    "usdt0Address" TEXT NOT NULL,
    "swapRouter" TEXT NOT NULL,
    "deployTxHash" TEXT NOT NULL,
    "manifestJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_walletAddress_key" ON "Merchant"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_merchantId_expiresAt_idx" ON "Session"("merchantId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthNonce_walletAddress_expiresAt_idx" ON "AuthNonce"("walletAddress", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicSlug_key" ON "Invoice"("publicSlug");

-- CreateIndex
CREATE INDEX "Invoice_merchantId_createdAt_idx" ON "Invoice"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_expiresAt_idx" ON "Invoice"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "InvoiceRecipient_invoiceId_idx" ON "InvoiceRecipient"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecipient_invoiceId_position_key" ON "InvoiceRecipient"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PayerSession_sessionTokenHash_key" ON "PayerSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "Quote_invoiceId_createdAt_idx" ON "Quote"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paymentId_key" ON "PaymentAttempt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_quoteId_key" ON "PaymentAttempt"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_xamanPayloadUuid_key" ON "PaymentAttempt"("xamanPayloadUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_xrplTxHash_key" ON "PaymentAttempt"("xrplTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_flareTxHash_key" ON "PaymentAttempt"("flareTxHash");

-- CreateIndex
CREATE INDEX "PaymentAttempt_invoiceId_createdAt_idx" ON "PaymentAttempt"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_updatedAt_idx" ON "PaymentAttempt"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "XamanPayload_payloadUuid_key" ON "XamanPayload"("payloadUuid");

-- CreateIndex
CREATE INDEX "XamanPayload_attemptId_kind_idx" ON "XamanPayload"("attemptId", "kind");

-- CreateIndex
CREATE INDEX "XamanPayload_payerSessionId_kind_idx" ON "XamanPayload"("payerSessionId", "kind");

-- CreateIndex
CREATE INDEX "ExecutorJob_status_nextRunAt_idx" ON "ExecutorJob"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutorJob_attemptId_jobType_generation_key" ON "ExecutorJob"("attemptId", "jobType", "generation");

-- CreateIndex
CREATE INDEX "ChainEvent_attemptId_eventName_idx" ON "ChainEvent"("attemptId", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_chainId_txHash_logIndex_key" ON "ChainEvent"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_deliveryKey_key" ON "WebhookEvent"("provider", "deliveryKey");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_idempotencyKey_key" ON "IdempotencyRecord"("scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_createdAt_idx" ON "AuditLog"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_network_version_key" ON "Deployment"("network", "version");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecipient" ADD CONSTRAINT "InvoiceRecipient_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_payerSessionId_fkey" FOREIGN KEY ("payerSessionId") REFERENCES "PayerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XamanPayload" ADD CONSTRAINT "XamanPayload_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XamanPayload" ADD CONSTRAINT "XamanPayload_payerSessionId_fkey" FOREIGN KEY ("payerSessionId") REFERENCES "PayerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutorJob" ADD CONSTRAINT "ExecutorJob_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainEvent" ADD CONSTRAINT "ChainEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
