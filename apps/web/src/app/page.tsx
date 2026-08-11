import { TestnetNotice } from '@paymorph/ui';
import Image from 'next/image';
import { HeroStoryController } from '@/components/marketing/hero-story-controller';
import { ScrollRevealController } from '@/components/marketing/scroll-reveal-controller';
import { XamanPhoneModel } from '@/components/marketing/xaman-phone-model';
import { ExecutorWarmupStatus } from '@/components/ui/executor-warmup-status';
import { LandingSplash } from '@/components/ui/landing-splash';

const journeySteps = [
  {
    number: '01',
    eyebrow: 'Customer pays XRP',
    title: 'Approve one exact payment in Xaman.',
    body: 'The amount, destination, memo, and committed settlement instruction are fixed before the customer signs.',
    route: 'Xaman → XRPL',
  },
  {
    number: '02',
    eyebrow: 'XRPL validates',
    title: 'PayMorph checks what actually reached the ledger.',
    body: 'A signature is only intent. The validated XRPL transaction must match every critical payment field.',
    route: 'Signed → Validated',
  },
  {
    number: '03',
    eyebrow: 'Flare verifies it',
    title: 'FDC turns the XRP payment into independent evidence.',
    body: 'The Flare Data Connector attests the validated XRPL payment so Coston2 can reason about it.',
    route: 'XRPL → FDC proof',
  },
  {
    number: '04',
    eyebrow: 'XRP becomes programmable',
    title: 'FAssets direct minting creates FXRP on Coston2.',
    body: 'The attested XRP payment authorizes FXRP minting into the payer-specific smart account—ready for atomic settlement.',
    route: 'FDC → FAssets → FXRP',
  },
] as const;

const evidenceSteps = [
  ['XRP payment', 'Validated transaction'],
  ['XRPL validation', 'Exact fields matched'],
  ['FDC proof', 'Attestation confirmed'],
  ['FXRP mint', 'Smart Account funded'],
  ['Coston2 settlement', 'Router transaction decoded'],
  ['Merchant payout', 'Recipient event confirmed'],
] as const;

const productSurfaces = [
  {
    number: '01',
    title: 'Invoices',
    copy: 'Publish exact terms and share a checkout built for one settlement.',
    href: '/dashboard/invoices',
  },
  {
    number: '02',
    title: 'Payment Links',
    copy: 'Reuse a hosted collection link without rebuilding the payment flow.',
    href: '/dashboard/payment-links',
  },
  {
    number: '03',
    title: 'POS',
    copy: 'Turn a merchant screen into a guided XRP Testnet checkout.',
    href: '/dashboard/pos',
  },
  {
    number: '04',
    title: 'API',
    copy: 'Create, publish, inspect, and reconcile payments server to server.',
    href: '/dashboard/developers',
  },
  {
    number: '05',
    title: 'WooCommerce',
    copy: 'Move orders to paid only after a verified settlement webhook.',
    href: '/dashboard/marketplace',
  },
  {
    number: '06',
    title: 'SDK',
    copy: 'Use the server-side Node client for the same canonical payment API.',
    href: '/dashboard/developers',
  },
] as const;

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="pm-home-shell">
      <LandingSplash />
      <ExecutorWarmupStatus />
      <HeroStoryController />
      <ScrollRevealController />

      <header className="pm-home-header">
        <nav aria-label="Primary navigation" className="pm-home-nav">
          <a aria-label="PayMorph home" className="pm-home-logo" href="/">
            <Image alt="PayMorph" fill priority sizes="190px" src="/paymorph-logo.png" />
          </a>
        </nav>
      </header>

      <section className="pm-home-hero" data-hero-story>
        <div className="pm-home-hero-glow" aria-hidden="true" />
        <div className="pm-home-container pm-home-hero-grid">
          <div className="pm-home-hero-copy">
            <p className="pm-home-kicker">Evidence-first XRP payments</p>
            <h1 aria-label="Pay with XRP. Settle on Flare. Prove every payment.">
              <span aria-hidden="true" className="pm-home-hero-line" data-hero-line>
                Pay with XRP.
              </span>
              <span aria-hidden="true" className="pm-home-hero-line" data-hero-line>
                Settle on Flare.
              </span>
              <span
                aria-hidden="true"
                className="pm-home-hero-line pm-home-hero-line-accent"
                data-hero-line
              >
                Prove every payment.
              </span>
            </h1>
            <p className="pm-home-lede">
              PayMorph lets customers pay from Xaman while merchants receive FXRP or USDT0 on
              Flare—with a clear evidence trail between them.
            </p>
            <div className="pm-home-actions">
              <a className="pm-home-button pm-home-button-primary" href="/login">
                Try Testnet Checkout <span aria-hidden="true">↗</span>
              </a>
              <a className="pm-home-button pm-home-button-quiet" href="#payment-journey">
                See How It Works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <TestnetNotice className="pm-home-testnet-note" />
          </div>

          <div className="pm-home-hero-visual" aria-label="PayMorph payment evidence path">
            <div className="pm-home-path-line" aria-hidden="true">
              <span />
            </div>
            {[
              ['Xaman', 'Customer approves'],
              ['XRPL', 'Payment validates'],
              ['FDC', 'Evidence verifies'],
              ['Flare', 'Merchant settles'],
            ].map(([system, state], index) => (
              <div className="pm-home-path-node" key={system}>
                <span className="pm-home-path-index">0{index + 1}</span>
                <span>
                  <strong>{system}</strong>
                  <small>{state}</small>
                </span>
                <i aria-hidden="true" />
              </div>
            ))}
            <div className="pm-home-hero-stamp">
              <span>Final authority</span>
              <strong>PaymentSettled</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="pm-home-problem" id="how-it-works">
        <div className="pm-home-container">
          <p className="pm-home-kicker pm-home-kicker-light" data-reveal="eyebrow">
            The cross-chain question
          </p>
          <h2 data-reveal="headline">
            A wallet says <em>SENT.</em>
            <br />
            Is the merchant actually paid?
          </h2>
          <div className="pm-home-problem-grid">
            <p data-reveal="copy">
              Cross-chain checkout passes through multiple systems. A Xaman signature confirms
              approval—but not XRPL validation, Flare evidence, FXRP minting, or merchant payout.
            </p>
            <p data-reveal="copy" data-reveal-delay="1">
              PayMorph keeps those moments separate and visible. Completion is earned only from the
              decoded on-chain settlement event.
            </p>
          </div>
          <div
            className="pm-home-sent-vs-paid"
            aria-label="Signed is not the same as settled"
            data-reveal="scale"
          >
            <span>Wallet signed</span>
            <i aria-hidden="true" />
            <strong>≠</strong>
            <i aria-hidden="true" />
            <span>Merchant settled</span>
          </div>
        </div>
      </section>

      <section className="pm-home-journey" id="payment-journey">
        <div className="pm-home-container">
          <div className="pm-home-section-heading">
            <p className="pm-home-kicker" data-reveal="eyebrow">
              Follow one payment
            </p>
            <h2 data-reveal="headline">From one tap in Xaman to programmable value on Flare.</h2>
            <p data-reveal="copy" data-reveal-delay="1">
              No protocol knowledge required. Just follow the verified next step.
            </p>
          </div>

          <div className="pm-home-journey-grid">
            <div className="pm-home-phone-column">
              <div className="pm-home-phone-sticky">
                <div data-reveal="scale">
                  <XamanPhoneModel />
                </div>
                <p className="pm-home-phone-caption" data-reveal="copy">
                  <span /> Supplied test account · XRPL Testnet
                </p>
              </div>
            </div>

            <div className="pm-home-journey-steps">
              {journeySteps.map((step) => (
                <article className="pm-home-journey-step" data-reveal="step" key={step.number}>
                  <div className="pm-home-step-topline">
                    <span>{step.number}</span>
                    <p>{step.eyebrow}</p>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <div className="pm-home-route-pill">
                    <span aria-hidden="true" /> {step.route}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pm-home-morph-zone">
        <div className="pm-home-container">
          <div className="pm-home-section-heading pm-home-section-heading-centered">
            <p className="pm-home-kicker" data-reveal="eyebrow">
              Settlement
            </p>
            <h2 data-reveal="headline">Your XRP payment enters the Flare economy.</h2>
            <p data-reveal="copy" data-reveal-delay="1">
              FXRP reaches the PayMorph router, where the committed merchant choice takes over.
            </p>
          </div>

          <div
            className="pm-home-protocol-flow"
            aria-label="XRP to FXRP settlement flow"
            data-reveal="flow"
          >
            <FlowToken label="XRP" detail="Paid on XRPL" />
            <FlowArrow label="FDC proof" />
            <FlowToken label="FXRP" detail="Minted by FAssets" active />
            <FlowArrow label="PayMorph router" />
            <div className="pm-home-settlement-split">
              <div>
                <FlowToken label="FXRP" detail="Merchant receives" />
              </div>
              <span>or</span>
              <div>
                <FlowToken label="USDT0" detail="Exact-output route" />
              </div>
            </div>
          </div>
          <p className="pm-home-route-disclosure" data-reveal="copy">
            USDT0 is offered only when the configured Coston2 route passes runtime health and
            liquidity checks. FXRP remains the fallback.
          </p>
        </div>
      </section>

      <section className="pm-home-proof-gate">
        <div className="pm-home-proof-before" data-reveal="headline">
          <span>XRPL validated · FDC confirmed · FXRP minted</span>
          <h2>We still don&apos;t call it paid.</h2>
        </div>
        <div className="pm-home-proof-divider" aria-hidden="true">
          <i />
        </div>
        <div className="pm-home-proof-after" data-reveal="scale">
          <p>Coston2 event decoded</p>
          <div className="pm-home-settled-mark" aria-hidden="true">
            ✓
          </div>
          <h2>PaymentSettled</h2>
          <strong>Now we do.</strong>
        </div>
      </section>

      <section className="pm-home-receipt-section">
        <div className="pm-home-container pm-home-receipt-grid">
          <div className="pm-home-receipt-copy">
            <p className="pm-home-kicker" data-reveal="eyebrow">
              Evidence receipt
            </p>
            <h2 data-reveal="headline">One understandable record of the whole journey.</h2>
            <p data-reveal="copy" data-reveal-delay="1">
              The receipt does not ask a merchant to trust PayMorph&apos;s internal status. It
              explains the evidence and links completion to the final router event.
            </p>
            <a className="pm-home-inline-link" data-reveal="copy" href="/explorer">
              View example receipt <span aria-hidden="true">↗</span>
            </a>
          </div>

          <article
            className="pm-home-receipt"
            aria-label="Illustrative PayMorph evidence receipt"
            data-reveal="scale"
          >
            <div className="pm-home-receipt-header">
              <div>
                <p>PayMorph receipt</p>
                <strong>Example evidence path</strong>
              </div>
              <span>TESTNET</span>
            </div>
            <div className="pm-home-receipt-id">
              <span>Settlement status</span>
              <strong>Verified</strong>
            </div>
            <ol>
              {evidenceSteps.map(([label, detail]) => (
                <li key={label}>
                  <span className="pm-home-receipt-check">✓</span>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="pm-home-receipt-authority">
              <span>Final authority</span>
              <strong>PayMorphRouter.PaymentSettled</strong>
            </div>
          </article>
        </div>
      </section>

      <section className="pm-home-products">
        <div className="pm-home-container">
          <div className="pm-home-section-heading">
            <p className="pm-home-kicker" data-reveal="eyebrow">
              The product
            </p>
            <h2 data-reveal="headline">One settlement engine. Multiple ways to get paid.</h2>
            <p data-reveal="copy" data-reveal-delay="1">
              Every surface uses the same exact checkout and evidence model.
            </p>
          </div>
          <div className="pm-home-product-grid">
            {productSurfaces.map((product, index) => (
              <a
                className="pm-home-product-card"
                data-reveal="card"
                data-reveal-delay={String(index % 3)}
                href={product.href}
                key={product.title}
              >
                <span>{product.number}</span>
                <h3>{product.title}</h3>
                <p>{product.copy}</p>
                <strong aria-hidden="true">↗</strong>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="pm-home-developer">
        <div className="pm-home-container pm-home-developer-grid">
          <div>
            <p className="pm-home-kicker pm-home-kicker-light" data-reveal="eyebrow">
              Built for developers
            </p>
            <h2 data-reveal="headline">One API call starts the same evidence-first flow.</h2>
            <p data-reveal="copy" data-reveal-delay="1">
              Create immutable payment terms with the Node SDK, publish the invoice, and reconcile
              the final receipt from verified events.
            </p>
            <a
              className="pm-home-button pm-home-button-light"
              data-reveal="copy"
              href="/dashboard/developers"
            >
              Open developer tools <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div
            className="pm-home-code-window"
            aria-label="PayMorph Node SDK example"
            data-reveal="scale"
          >
            <div className="pm-home-code-toolbar">
              <span />
              <span />
              <span />
              <strong>create-invoice.ts</strong>
            </div>
            <pre>
              <code>{`const paymorph = new PayMorphClient('pm_test_…');

const invoice = await paymorph.createInvoice({
  title: 'Studio retainer',
  denomination: 'USD',
  amount: '250.00',
  settlementAsset: 'USDT0',
  expiresAt: '2026-08-10T12:00:00.000Z',
  recipients: [{ label: 'Studio', address, bps: 10000 }]
});

await paymorph.publishInvoice(invoice.id);`}</code>
            </pre>
          </div>
        </div>
      </section>

      <footer className="pm-home-footer">
        <div className="pm-home-container" data-reveal="copy">
          <div className="pm-home-footer-logo">
            <Image alt="PayMorph" fill sizes="170px" src="/paymorph-logo.png" />
          </div>
          <p>Pay with XRP. Settle on Flare. Prove every payment.</p>
          <span>XRPL Testnet · Flare Coston2 · Test tokens have no monetary value.</span>
        </div>
      </footer>
    </main>
  );
}

function FlowToken({
  active = false,
  detail,
  label,
}: {
  active?: boolean;
  detail: string;
  label: string;
}) {
  return (
    <div className="pm-home-flow-token" data-active={active || undefined}>
      <span>{label.slice(0, 1)}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="pm-home-flow-arrow" aria-label={label}>
      <span>{label}</span>
      <i />
    </div>
  );
}
