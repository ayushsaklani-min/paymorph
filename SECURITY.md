# Security policy

PayMorph is testnet software and has not been audited. It is not ready for
mainnet or real-value payments.

## Reporting

Do not open a public issue for a vulnerability. Send a private report to the
maintainer with affected components, reproduction steps, impact, and suggested
mitigations.

## Security boundaries

- PayMorph never receives payer or merchant private keys.
- The executor key is testnet-only, least-privileged, and server-side.
- Dynamic Flare protocol addresses are registry-resolved and bytecode-checked.
- Chain events, not webhooks or database flags, prove settlement.
- Contract replay protection and off-chain idempotency are both required.
- Sensitive provider tokens and committed user-operation bytes are encrypted at
  rest.

See `docs/architecture.md` and `docs/runbooks/security-review.md` for the threat
model and release gates.
