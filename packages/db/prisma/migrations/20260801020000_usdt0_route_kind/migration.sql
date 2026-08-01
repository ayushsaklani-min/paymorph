-- Distinguish an official DEX route from ADR 0007's separately labelled
-- PayMorph Coston2 testnet route in each immutable USDT0 quote snapshot.
ALTER TABLE "Quote" ADD COLUMN "usdt0RouteKind" TEXT;
