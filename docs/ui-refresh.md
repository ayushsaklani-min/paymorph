# PayMorph UI refresh

Updated: 2026-08-01

## Intent

The PayMorph interface now uses a deeper, editorial visual system inspired by
the interaction principles observed in the local NullPay reference: layered
dark surfaces, fine grid/noise texture, luminous boundary treatments, gradual
scroll reveals, and tactile hover feedback. No NullPay code, assets, wording,
or product identity was copied.

PayMorph retains an independent visual identity:

- aurora lime, cyan, and blue replace the reference product's orange palette;
- evidence language, testnet disclosures, and settlement state authority stay
  visible at every customer-facing payment surface;
- card, action, and data typography use local system font stacks, avoiding a
  runtime font download or a new external dependency.

## Shared UI system

`apps/web/src/app/globals.css` provides the reusable presentation layer:

- graded midnight background with subtle grid and grain;
- system display, body, and monospace data typography;
- `pm-panel` glass surfaces and `pm-card` hover/lift cards;
- `pm-button` primary/secondary actions with a restrained sheen;
- decorative pointer aura and orbital objects that never accept input;
- scroll reveal animation with `prefers-reduced-motion` support.

The interaction layer is purely decorative. It cannot alter wallet selection,
Xaman state, quotes, payment status, API calls, or settlement authority.

## Updated surfaces

- landing page and product narrative;
- merchant sign-in and full dashboard shell;
- invoices and payments views;
- payer checkout and live payment status;
- public evidence explorer, network diagnostics, and receipt.

## Verification

On 2026-08-01, web typecheck, lint, 94 web tests, and a Next.js production
build passed. This UI-only phase did not modify protocol, API, database,
contract, executor, or payment state behavior.
