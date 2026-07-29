# PayMorph

**Pay in XRP. Settle your way.**

PayMorph is a testnet cross-chain checkout that lets a customer sign one native
XRP payment while a merchant receives programmable FXRP or, when a verified
route is healthy, exact-output USDT0 on Flare Coston2. Revenue splits, fees,
replay protection, and receipts are enforced by contracts and verified from
chain events.

> PayMorph currently targets XRPL Testnet and Flare Coston2. All displayed
> tokens are testnet assets with no real monetary value.

## Repository

```text
apps/web          Next.js merchant dashboard, checkout, API, receipts
apps/executor     Restart-safe XRPL/FDC/Coston2 worker
packages/contracts Solidity contracts, Foundry tests, deployments
packages/db       Prisma schema, client, and durable job queue
packages/shared   Domain types, validation, amounts, state machine, ABIs
packages/ui       Shared accessible React components
scripts           Network resolution, seed, smoke, deployment verification
docs              Architecture, API, runbooks, ADRs, blueprint
infra             Local and hosted deployment assets
```

## Prerequisites

- Node.js 24 LTS
- pnpm 10+
- Docker
- Foundry

## Local setup

```bash
cp .env.example .env.local
docker compose -f infra/docker-compose.yml up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Real Xaman, XRPL Testnet, FDC, and Coston2 execution requires testnet-only
credentials documented in `.env.example`. Root development and operational
scripts load the repository-root `.env.local` for both applications. Production
code has no fake-success fallback.

## Verification

```bash
pnpm verify
pnpm test:contracts
pnpm --filter @paymorph/web exec playwright install chromium
pnpm test:e2e
pnpm test:live
```

`test:live` is opt-in and verifies a real testnet checkout completed through
the Xaman UI and executor.

The default contract deployment is FXRP-only because the currently documented
Coston2 SparkDEX router fails the runtime bytecode gate. USDT0 remains visibly
disabled until the complete route is verified. After a hosted tiny checkout,
run the live verifier with
`RUN_LIVE_TESTNET=1 LIVE_ATTEMPT_ID=<uuid> pnpm test:live`.

The current implementation/acceptance ledger, including environment-blocked
gates, is maintained in
[the implementation plan](docs/implementation-plan.md). Durable protocol facts
and unresolved external assumptions are maintained in [memory](memory.md).

See [architecture](docs/architecture.md), the
[implementation plan](docs/implementation-plan.md), and
[security policy](SECURITY.md).
