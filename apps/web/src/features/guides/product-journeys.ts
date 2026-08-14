export const PRODUCT_JOURNEY_KEYS = [
  'overview',
  'payments',
  'invoices',
  'paymentLinks',
  'paymentRequests',
  'pos',
  'developers',
  'treasury',
  'marketplace',
  'settings',
] as const;

export type ProductJourneyKey = (typeof PRODUCT_JOURNEY_KEYS)[number];

export type ProtocolMark = 'paymorph' | 'xaman' | 'xrp' | 'fdc' | 'fassets' | 'flare' | 'usdt0';

export interface ProductJourneyStep {
  id: string;
  label: string;
  title: string;
  description: string;
  checkpoint: string;
  marks?: readonly ProtocolMark[];
}

export interface ProductJourney {
  id: string;
  eyebrow: string;
  title: string;
  introduction: string;
  outcome: string;
  steps: readonly [ProductJourneyStep, ...ProductJourneyStep[]];
}

export const PRODUCT_JOURNEYS: Record<ProductJourneyKey, ProductJourney> = {
  overview: {
    id: 'overview-journey',
    eyebrow: 'Read the workspace',
    title: 'From collection to evidence, without reading chain logs.',
    introduction:
      'The overview is an operational projection. It helps you find a payment, then leads you to the evidence that makes settlement authoritative.',
    outcome: 'A decoded PaymentSettled event is the final word.',
    steps: [
      {
        id: 'collect',
        label: 'Collect',
        title: 'A payer starts from a published checkout.',
        description:
          'Invoices, payment links, requests, and POS all converge on the same protected PayMorph payment flow.',
        checkpoint: 'One canonical attempt is created for the payer.',
      },
      {
        id: 'follow',
        label: 'Follow',
        title: 'The funnel shows the verified stage reached.',
        description:
          'Xaman approval, XRPL validation, FDC evidence, and Coston2 execution remain separate milestones.',
        checkpoint: 'A signature is progress—not proof of settlement.',
      },
      {
        id: 'confirm',
        label: 'Confirm',
        title: 'Open the payment when a decision matters.',
        description:
          'The payment detail and public receipt connect provider status to independently inspectable transaction evidence.',
        checkpoint: 'Only PaymentSettled contributes to verified totals.',
      },
    ],
  },
  payments: {
    id: 'payments-journey',
    eyebrow: 'How settlement works',
    title: 'A payment becomes final one verified boundary at a time.',
    introduction:
      'PayMorph keeps each network transition visible so an approval, webhook, or redirect is never mistaken for completed merchant settlement.',
    outcome: 'PaymentSettled decoded. Receipt ready.',
    steps: [
      {
        id: 'xaman',
        label: 'Xaman',
        marks: ['xaman'],
        title: 'The payer signs the exact XRP Testnet payment.',
        description:
          'The bound XRPL account reviews the destination, amount, and committed payment instruction in Xaman.',
        checkpoint: 'PayMorph fetches the authoritative payload after notification.',
      },
      {
        id: 'xrpl',
        label: 'XRPL',
        marks: ['xrp'],
        title: 'The transaction must validate on XRPL Testnet.',
        description:
          'Destination, amount, account, network result, and committed fields are checked against the protected attempt.',
        checkpoint: 'Validated XRPL evidence—not the browser redirect.',
      },
      {
        id: 'fdc',
        label: 'FDC',
        marks: ['fdc', 'flare'],
        title: 'Flare verifies independent payment evidence.',
        description:
          'The executor waits for the Flare Data Connector proof lifecycle instead of inventing a local success shortcut.',
        checkpoint: 'FDC timing can span several voting rounds on testnet.',
      },
      {
        id: 'settlement',
        label: 'Coston2',
        marks: ['fassets', 'usdt0'],
        title: 'The router executes the committed settlement.',
        description:
          'FXRP is delivered to recipients, or the health-gated test route converts it to labelled PAYMORPH_TESTNET USDT0.',
        checkpoint: 'On-chain replay protection prevents duplicate settlement.',
      },
      {
        id: 'receipt',
        label: 'Receipt',
        marks: ['paymorph'],
        title: 'PayMorph decodes the final settlement event.',
        description:
          'Only the PayMorphRouter PaymentSettled event moves the attempt to SETTLED and produces a final evidence receipt.',
        checkpoint: 'This is when PayMorph calls the merchant paid.',
      },
    ],
  },
  invoices: {
    id: 'invoices-journey',
    eyebrow: 'How invoices work',
    title: 'Define the promise once. Settle against the same instruction.',
    introduction:
      'An invoice fixes the commercial terms before a payer begins, while exact integer units and recipient splits stay intact through settlement.',
    outcome: 'Published terms become a protected checkout.',
    steps: [
      {
        id: 'define',
        label: 'Define',
        marks: ['xrp', 'fassets', 'usdt0'],
        title: 'Choose the amount, denomination, and settlement asset.',
        description:
          'Human-readable values are converted to canonical base units without floating-point money arithmetic.',
        checkpoint: 'FXRP is the fallback whenever USDT0 is unavailable.',
      },
      {
        id: 'route',
        label: 'Route',
        title: 'Assign one recipient or an exact 100% split.',
        description:
          'Recipient percentages are encoded as integer basis points for deterministic router distribution.',
        checkpoint: 'The merchant can split settlement without PayMorph custody.',
      },
      {
        id: 'publish',
        label: 'Publish',
        title: 'Publish an immutable public checkout.',
        description:
          'The payer receives a stable link whose protected terms are used to build the exact payment attempt.',
        checkpoint: 'Every attempt remains tied to the invoice instruction.',
      },
      {
        id: 'reconcile',
        label: 'Reconcile',
        title: 'Follow attempts through to final evidence.',
        description:
          'Invoice activity is operational context; the decoded router event remains settlement authority.',
        checkpoint: 'Open the receipt before treating the invoice as paid.',
      },
    ],
  },
  paymentLinks: {
    id: 'payment-links-journey',
    eyebrow: 'How payment links work',
    title: 'Share one link. Keep one settlement path.',
    introduction:
      'Payment links add a reusable collection surface without creating a second payment engine or weakening evidence requirements.',
    outcome: 'Convenient distribution, canonical settlement.',
    steps: [
      {
        id: 'configure',
        label: 'Configure',
        title: 'Set the link’s checkout defaults.',
        description:
          'Choose reusable or single-use behavior and define the invoice terms a payer will see.',
        checkpoint: 'The route currently settles to FXRP on Coston2.',
      },
      {
        id: 'share',
        label: 'Share',
        title: 'Send the hosted link through your own channel.',
        description:
          'PayMorph hosts the checkout while you control where the URL is published or delivered.',
        checkpoint: 'No messaging or delivery claim is implied.',
      },
      {
        id: 'materialize',
        label: 'Checkout',
        title: 'A payer visit becomes a canonical invoice.',
        description:
          'The link delegates to the same invoice and payer-bound quote workflow used everywhere else.',
        checkpoint: 'There is no parallel or mock settlement path.',
      },
      {
        id: 'verify',
        label: 'Verify',
        marks: ['xaman', 'xrp', 'fdc', 'flare'],
        title: 'Track the resulting payment to its receipt.',
        description:
          'Xaman, XRPL, FDC, FXRP, and router evidence remain visible after the convenience layer ends.',
        checkpoint: 'The final event—not the link visit—confirms payment.',
      },
    ],
  },
  paymentRequests: {
    id: 'payment-requests-journey',
    eyebrow: 'How requests work',
    title: 'Turn a named request into an evidence-backed checkout.',
    introduction:
      'Requests help merchants organize who or what a collection is for. PayMorph creates the link; the merchant chooses how to deliver it.',
    outcome: 'A named collection with the same settlement proof.',
    steps: [
      {
        id: 'name',
        label: 'Create',
        title: 'Add a reference, recipient context, amount, and expiry.',
        description:
          'The request records merchant-facing context and produces an immutable public invoice.',
        checkpoint: 'Use the reference to reconcile the payment later.',
      },
      {
        id: 'deliver',
        label: 'Deliver',
        title: 'Copy and send the checkout link yourself.',
        description:
          'PayMorph does not currently send email, SMS, or track whether a recipient opened the request.',
        checkpoint: 'Distribution stays under the merchant’s control.',
      },
      {
        id: 'pay',
        label: 'Pay',
        marks: ['xaman', 'xrp'],
        title: 'The recipient completes the standard Xaman flow.',
        description:
          'Account binding, exact-payment approval, and provider verification are identical to invoice checkout.',
        checkpoint: 'The request does not bypass payer verification.',
      },
      {
        id: 'evidence',
        label: 'Evidence',
        title: 'Use the payment view for final status.',
        description:
          'Request state helps organization; only settlement evidence proves merchant payout.',
        checkpoint: 'PaymentSettled remains authoritative.',
      },
    ],
  },
  pos: {
    id: 'pos-journey',
    eyebrow: 'How POS works',
    title: 'A counter sale, protected like every online checkout.',
    introduction:
      'POS creates a short-lived FXRP invoice and starts a provider-issued Xaman session for an in-person customer.',
    outcome: 'Hand over goods only after the final receipt.',
    steps: [
      {
        id: 'sale',
        label: 'Sale',
        title: 'Enter the item and customer-facing amount.',
        description:
          'PayMorph creates one immutable FXRP invoice with a 30-minute checkout window.',
        checkpoint: 'Each sale gets a fresh, idempotent invoice.',
      },
      {
        id: 'scan',
        label: 'Xaman',
        marks: ['xaman'],
        title: 'Let the customer scan the provider-issued QR.',
        description:
          'The first approval binds their XRP Testnet account; the exact payment request follows in Xaman.',
        checkpoint: 'A browser link remains available as a fallback.',
      },
      {
        id: 'wait',
        label: 'Verify',
        marks: ['xrp', 'fdc'],
        title: 'Keep the sale open while networks verify it.',
        description:
          'A sent screen or wallet signature is not enough—XRPL and FDC evidence must still complete.',
        checkpoint: 'The UI reports progress without inventing success.',
      },
      {
        id: 'handover',
        label: 'Complete',
        marks: ['flare', 'paymorph'],
        title: 'Confirm the receipt before handover.',
        description:
          'The final Coston2 event proves the configured merchant recipient received settlement.',
        checkpoint: 'Only then is the POS sale complete.',
      },
    ],
  },
  developers: {
    id: 'developers-journey',
    eyebrow: 'How API access works',
    title: 'Give trusted servers the smallest permission they need.',
    introduction:
      'Testnet API keys expose PayMorph’s hosted invoice surface without exposing the merchant wallet session or storing readable credentials.',
    outcome: 'Scoped access that can be observed and revoked.',
    steps: [
      {
        id: 'scope',
        label: 'Scope',
        title: 'Choose read or write capabilities deliberately.',
        description:
          'Issue only the invoice scopes required by the server or integration using the credential.',
        checkpoint: 'Every key is restricted to its merchant.',
      },
      {
        id: 'store',
        label: 'Store',
        title: 'Copy the secret once and keep it server-side.',
        description:
          'PayMorph retains a hash for authentication; the readable secret is not displayed again.',
        checkpoint: 'Never place a key in browser code or public source.',
      },
      {
        id: 'call',
        label: 'Integrate',
        title: 'Call the versioned API with a Bearer token.',
        description:
          'Create or list invoices from a trusted backend while preserving idempotency on mutations.',
        checkpoint: 'The Node client remains private and is not a published SDK.',
      },
      {
        id: 'rotate',
        label: 'Control',
        title: 'Observe last use and revoke access instantly.',
        description:
          'Create a replacement before revoking a live integration to rotate without unnecessary downtime.',
        checkpoint: 'Revoked credentials fail closed.',
      },
    ],
  },
  treasury: {
    id: 'treasury-journey',
    eyebrow: 'How treasury reads',
    title: 'See settled history without pretending to be a wallet.',
    introduction:
      'Treasury summarizes recent PayMorph settlement events. It is a reconciliation view, not custody, an account balance, or a complete portfolio indexer.',
    outcome: 'A fast projection with receipts one click away.',
    steps: [
      {
        id: 'filter',
        label: 'Filter',
        title: 'PayMorph selects final merchant attempts only.',
        description:
          'Pending, failed, and merely signed payments never contribute to these totals.',
        checkpoint: 'Status must already be backed by PaymentSettled.',
      },
      {
        id: 'summarize',
        label: 'Summarize',
        title: 'Recent settled outputs are grouped by asset.',
        description:
          'FXRP and labelled test USDT0 totals are calculated from the latest 50 settled attempts.',
        checkpoint: 'This is intentionally not a live wallet balance.',
      },
      {
        id: 'inspect',
        label: 'Inspect',
        title: 'Open any receipt for the underlying evidence.',
        description:
          'The receipt connects the projection back to XRPL validation, Flare proof, and router execution.',
        checkpoint: 'Use chain evidence for final reconciliation.',
      },
    ],
  },
  marketplace: {
    id: 'marketplace-journey',
    eyebrow: 'How split settlement works',
    title: 'One verified payment. Deterministic recipient distribution.',
    introduction:
      'The marketplace view projects invoice splits already configured by the merchant. It is not an order book, escrow service, or custodial marketplace.',
    outcome: 'Recipients are paid as part of one final router execution.',
    steps: [
      {
        id: 'compose',
        label: 'Compose',
        title: 'Create an invoice with multiple recipients.',
        description: 'Add labelled Coston2 addresses whose exact percentage shares total 100%.',
        checkpoint: 'Invalid or incomplete allocations are rejected.',
      },
      {
        id: 'commit',
        label: 'Commit',
        title: 'The split travels with the payment instruction.',
        description:
          'Recipient routing is part of the committed operation—not an editable note applied after payment.',
        checkpoint: 'The original operation bytes remain preserved.',
      },
      {
        id: 'distribute',
        label: 'Distribute',
        title: 'The router pays recipients in final settlement.',
        description:
          'PayMorph does not hold funds between the payer and recipients; distribution executes on Coston2.',
        checkpoint: 'On-chain replay protection applies to the whole payment.',
      },
      {
        id: 'project',
        label: 'Project',
        title: 'This page summarizes configured split outcomes.',
        description:
          'Open the invoice or payment receipt when you need authoritative details for a specific settlement.',
        checkpoint: 'The projection never replaces the receipt.',
      },
    ],
  },
  settings: {
    id: 'settings-journey',
    eyebrow: 'How settings apply',
    title: 'Configure the merchant surface without weakening the protocol.',
    introduction:
      'Profile settings control presentation, defaults, and optional outbound notifications. They do not bypass payment validation or settlement evidence.',
    outcome: 'Consistent checkout defaults with secure integration hooks.',
    steps: [
      {
        id: 'identity',
        label: 'Identity',
        title: 'Set the merchant name and public logo URL.',
        description:
          'These fields help customers recognize the checkout; the connected merchant wallet remains the account anchor.',
        checkpoint: 'Use a stable HTTPS image URL for production branding.',
      },
      {
        id: 'asset',
        label: 'Settlement',
        marks: ['fassets', 'usdt0'],
        title: 'Choose the preferred settlement asset.',
        description:
          'FXRP remains the safe fallback. USDT0 is offered only when the configured real route passes health checks.',
        checkpoint: 'A preference cannot force an unhealthy route.',
      },
      {
        id: 'webhook',
        label: 'Webhook',
        title: 'Optionally connect your own HTTPS endpoint.',
        description:
          'PayMorph signs timestamp plus raw body with the secret you provide and delivers settlement notifications.',
        checkpoint: 'Verify signatures before trusting the payload.',
      },
      {
        id: 'save',
        label: 'Apply',
        title: 'Save once, then test the affected surface.',
        description:
          'Profile changes update future merchant experiences while historic settlement evidence remains unchanged.',
        checkpoint: 'Rotate webhook secrets deliberately when needed.',
      },
    ],
  },
};
