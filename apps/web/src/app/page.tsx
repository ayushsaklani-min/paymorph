import { TestnetNotice } from '@paymorph/ui';

const proofPath = [
  ['01', 'Sign once', 'Approve the exact native XRP Testnet payment in Xaman.'],
  ['02', 'Validate precisely', 'Check every committed payment field on XRPL.'],
  ['03', 'Prove independently', 'Request FDC evidence for the validated payment.'],
  ['04', 'Settle on-chain', 'Decode PaymentSettled before publishing the receipt.'],
];

type StoryItem = {
  source: string;
  sourceHref: string;
  context: string;
  body: string;
  response?: string;
};

const protocolFacts: StoryItem[] = [
  {
    source: 'XRPL Ledger Structure',
    sourceHref: 'https://xrpl.org/docs/concepts/ledgers/ledger-structure',
    context: 'Protocol fact · XRP Ledger',
    body: 'Validated ledger versions form a public history of transactions and their results.',
  },
  {
    source: 'XRPL Accounts',
    sourceHref: 'https://xrpl.org/docs/concepts/accounts',
    context: 'Protocol fact · XRP Ledger',
    body: 'An XRP Ledger account includes a public address, XRP balance, and transaction history.',
  },
  {
    source: 'XRPL Transactions',
    sourceHref: 'https://xrpl.org/docs/introduction/transactions-and-requests',
    context: 'Protocol fact · XRP Ledger',
    body: 'An XRP payment carries an amount and a public destination address, then awaits ledger confirmation.',
  },
  {
    source: 'Flare FDC attestations',
    sourceHref: 'https://dev.flare.network/fdc/attestation-types',
    context: 'Protocol fact · Flare FDC',
    body: 'FDC can attest XRP Ledger payment information, including memo data and destination tags.',
  },
  {
    source: 'Flare direct minting',
    sourceHref: 'https://dev.flare.network/fassets/developer-guides/fassets-direct-minting',
    context: 'Protocol fact · FAssets',
    body: 'After the XRP payment confirms, an executor finalizes direct FXRP minting on Flare.',
  },
];

const paymentConfidence: StoryItem[] = [
  {
    source: 'Public context: status clarity',
    sourceHref: 'https://www.reddit.com/r/XRP/comments/1d1611p/',
    context: 'PayMorph clarity · live progress',
    body: 'See the payment path, not just a spinner. The live timeline separates the Xaman signature, XRP validation, FDC proof, and final on-chain settlement.',
    response:
      'Built for confidence: every stage says what happens next and what has already been verified.',
  },
  {
    source: 'Public context: recipient timing',
    sourceHref: 'https://www.reddit.com/r/XRP/comments/1dnhs78/',
    context: 'PayMorph precision · exact payment',
    body: 'Approve one exact payment. PayMorph commits the amount, destination, memo, and merchant terms before the payer signs in Xaman.',
    response:
      'Built for precision: the signed payment is validated against those exact instructions afterward.',
  },
  {
    source: 'Public context: payment instructions',
    sourceHref: 'https://www.reddit.com/r/XRP/comments/egd8xm/',
    context: 'PayMorph finality · real receipt',
    body: 'Receive a receipt earned through evidence. A source XRP payment is visible, while merchant completion waits for the decoded router settlement event.',
    response:
      'Built for trust: a redirect, callback, or wallet state never declares a payment complete.',
  },
];

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="pm-shell overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <nav
          aria-label="Primary navigation"
          className="pm-panel pm-editorial-nav flex items-center justify-between rounded-2xl px-4 py-2.5 sm:px-5"
        >
          <a className="pm-brand" href="/">
            <MorphMark />
            <span>
              <span className="block text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
              <span className="pm-data block text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Evidence-first checkout
              </span>
            </span>
          </a>
          <div className="flex items-center gap-1 sm:gap-3">
            <a
              className="hidden rounded-full px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-white/[0.045] hover:text-[var(--ink)] sm:inline"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="hidden rounded-full px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-white/[0.045] hover:text-[var(--ink)] md:inline"
              href="/explorer"
            >
              Explorer
            </a>
            <a
              className="pm-button pm-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
              href="/login"
            >
              Merchant sign in <span aria-hidden="true">↗</span>
            </a>
          </div>
        </nav>

        <section className="relative grid flex-1 items-center gap-12 py-20 sm:py-28 lg:grid-cols-[1.03fr_0.97fr] lg:py-32">
          <div className="relative z-10">
            <p className="pm-kicker">XRPL Testnet · Flare Coston2</p>
            <h1 className="pm-display mt-6 max-w-3xl text-5xl leading-[0.91] sm:text-7xl lg:text-[5.45rem]">
              Payment clarity
              <br />
              begins <span className="text-[var(--accent)]">in the open.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-[var(--muted-strong)] sm:text-lg">
              PayMorph turns a native XRP Testnet payment into a merchant settlement that is
              explained step by step—and only called complete when on-chain evidence says so.
            </p>
            <div className="pm-hero-rule" />
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                className="pm-button pm-button-primary inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold"
                href="/login"
              >
                Create a test invoice <span aria-hidden="true">↗</span>
              </a>
              <a
                className="pm-button pm-button-secondary inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--muted-strong)]"
                href="/network"
              >
                Inspect the network <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-2.5 text-[11px] font-medium text-[var(--muted)]">
              {['Xaman identity', 'Exact XRP payment', 'FDC evidence', 'On-chain receipt'].map(
                (item) => (
                  <span
                    className="rounded-full border border-[var(--line)] bg-white/[0.025] px-3 py-1.5"
                    key={item}
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="pm-scroll-reveal relative z-10 lg:pl-8">
            <div className="pm-hero-proof rounded-[2rem] p-4 sm:p-5">
              <div className="relative rounded-[1.5rem] border border-white/[0.08] bg-black/15 p-5 sm:p-7">
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="pm-eyebrow">Settlement atlas</p>
                    <h2 className="pm-display mt-3 text-2xl tracking-[-0.04em] sm:text-3xl">
                      One payment. Four proofs.
                    </h2>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-blue)]">
                    <span className="size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                    Testnet
                  </span>
                </div>

                <div className="relative mt-8">
                  {proofPath.map(([step, title, detail], index) => (
                    <div key={step}>
                      <div className="group grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3.5 transition duration-300 hover:border-[var(--accent)]/35 hover:bg-[var(--accent)]/[0.055]">
                        <span className="pm-data grid size-9 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-xs font-semibold text-[var(--accent-blue)]">
                          {step}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold tracking-[-0.02em]">
                            {title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                            {detail}
                          </span>
                        </span>
                        <span
                          className={`size-2 rounded-full ${
                            index === 3
                              ? 'bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]'
                              : 'bg-[var(--accent-blue)]/70'
                          }`}
                        />
                      </div>
                      {index < proofPath.length - 1 ? <div className="pm-trace-line" /> : null}
                    </div>
                  ))}
                </div>
                <TestnetNotice className="relative mt-5 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-xs leading-5 text-[var(--muted)]" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section
        className="pm-story-surface border-y py-10 sm:py-14"
        aria-labelledby="open-ledger-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div className="relative z-10">
              <p className="pm-kicker">The public-chain reality</p>
              <h2
                className="pm-display mt-5 max-w-lg text-4xl leading-[0.95] sm:text-5xl"
                id="open-ledger-heading"
              >
                Every payment deserves a clear next step.
              </h2>
              <p className="mt-5 max-w-md leading-7 text-[var(--muted-strong)]">
                PayMorph turns real checkout needs into a reassuring evidence path: clear progress,
                exact instructions, and a receipt with a verifiable source of truth.
              </p>
            </div>
            <div
              className="relative min-w-0 overflow-hidden py-2"
              aria-label="PayMorph payment confidence"
            >
              <StoryRail items={paymentConfidence} />
            </div>
          </div>
          <div
            className="relative mt-4 min-w-0 overflow-hidden py-2"
            aria-label="Public-chain protocol facts"
          >
            <StoryRail items={[...protocolFacts].reverse()} reverse />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8">
        <section className="pm-scroll-reveal grid gap-4 md:grid-cols-3">
          <SignalCard
            detail="No browser return, callback, or internal row can mark a payment complete."
            label="Evidence, not optimism"
            number="01"
          />
          <SignalCard
            detail="Quotes, payment instructions, and recipient splits stay fixed once published."
            label="Committed financial terms"
            number="02"
          />
          <SignalCard
            detail="Links, POS, requests, API, and WooCommerce use one canonical settlement model."
            label="One canonical checkout"
            number="03"
          />
        </section>

        <section
          className="pm-scroll-reveal mt-24 grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"
          id="how-it-works"
        >
          <div>
            <p className="pm-kicker">Merchant visibility</p>
            <h2 className="pm-display mt-5 max-w-md text-4xl leading-[0.98] sm:text-5xl">
              A dashboard that speaks in evidence.
            </h2>
            <p className="mt-5 max-w-lg leading-7 text-[var(--muted-strong)]">
              Follow an understandable path from customer intent to chain finality. The important
              details stay close when they matter, without making a customer decode a block
              explorer.
            </p>
            <a
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-blue)] transition hover:gap-3"
              href="/explorer"
            >
              Explore verified settlements <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="pm-panel rounded-[2rem] p-4 sm:p-5">
            <div className="pm-product-surface rounded-[1.45rem] border p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
                <div>
                  <p className="pm-eyebrow">Settlement monitor</p>
                  <p className="pm-display mt-1 text-xl tracking-[-0.035em]">
                    Evidence-backed activity
                  </p>
                </div>
                <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--accent-blue)]">
                  Ready to verify
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['Quote', 'Committed', 'var(--accent-blue)'],
                  ['XRPL', 'Validated', 'var(--accent-cyan)'],
                  ['Receipt', 'Event decoded', 'var(--accent)'],
                ].map(([label, state, color]) => (
                  <div className="pm-card rounded-2xl p-4" key={label}>
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    <p className="mt-4 text-xs text-[var(--muted)]">{label}</p>
                    <p className="mt-1 text-sm font-semibold">{state}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4 text-xs text-[var(--muted)]">
                  <span className="pm-data">PAYMENT_SETTLED</span>
                  <span className="text-[var(--accent-blue)]">Final authority</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full w-[78%] rounded-full bg-[linear-gradient(90deg,var(--accent-blue),var(--accent-cyan),var(--accent))]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MorphMark() {
  return (
    <span aria-hidden="true" className="pm-logo-mark">
      <span>P</span>
    </span>
  );
}

function SignalCard({ detail, label, number }: { detail: string; label: string; number: string }) {
  return (
    <article className="pm-card rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="pm-data text-xs font-bold text-[var(--accent-blue)]">{number}</span>
        <span className="size-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
      </div>
      <h3 className="pm-display mt-8 text-xl tracking-[-0.035em]">{label}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function StoryRail({ items, reverse = false }: { items: StoryItem[]; reverse?: boolean }) {
  const railItems = [...items, ...items];
  return (
    <div className="pm-story-rail" data-direction={reverse ? 'reverse' : undefined}>
      {railItems.map((item, index) => (
        <article
          aria-hidden={index >= items.length}
          className="pm-story-card"
          key={`${item.source}-${index}`}
        >
          <p className="pm-eyebrow text-[10px]">{item.context}</p>
          <p className="mt-5 text-sm leading-6 text-[var(--muted-strong)]">{item.body}</p>
          {item.response ? (
            <p className="mt-3 border-l border-[var(--accent)]/40 pl-3 text-xs leading-5 text-[var(--accent-blue)]">
              {item.response}
            </p>
          ) : null}
          <a
            className="mt-6 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] transition hover:text-[var(--accent)]"
            href={item.sourceHref}
            rel="noreferrer"
            target="_blank"
          >
            {item.source} <span aria-hidden="true">↗</span>
          </a>
        </article>
      ))}
    </div>
  );
}
