-- Persist the exact-output route snapshot used to construct immutable USDT0
-- settlement bytes. FXRP-only quotes intentionally leave these fields NULL.
ALTER TABLE "Quote"
  ADD COLUMN "quotedFxrpInputUBA" DECIMAL(78, 0),
  ADD COLUMN "swapRouterAddress" TEXT,
  ADD COLUMN "swapQuoterAddress" TEXT,
  ADD COLUMN "swapPoolAddress" TEXT;
