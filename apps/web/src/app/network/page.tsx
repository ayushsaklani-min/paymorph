import type { Metadata } from 'next';
import { COSTON2_CHAIN_ID } from '@paymorph/shared';
import { resolveConfiguredNetwork } from '@/lib/server/network';

export const metadata: Metadata = { title: 'Network diagnostics' };

export const dynamic = 'force-dynamic';

export default async function NetworkPage() {
  const network = await resolveConfiguredNetwork().catch(() => null);
  const usdt0 = network?.capabilities.USDT0;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="pm-shell mx-auto min-h-screen max-w-4xl px-6 py-6 sm:py-10"
    >
      <header className="pm-panel pm-editorial-nav flex items-center justify-between gap-4 rounded-3xl px-4 py-3 sm:px-5">
        <a
          className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
          href="/"
        >
          ← PayMorph
        </a>
        <span className="pm-data text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
          Live reads
        </span>
      </header>
      <p className="pm-kicker mt-14">Network diagnostics</p>
      <h1 className="pm-display mt-4 text-4xl sm:text-5xl">Verify the route before you use it.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-[var(--muted-strong)]">
        Live registry, FXRP, FTSO, route, and executor readiness is exposed here after server
        configuration. No provider status is inferred from a database flag.
      </p>
      <dl className="mt-10 grid gap-4 sm:grid-cols-2">
        <Diagnostic label="Destination chain" value={`Flare Coston2 (${COSTON2_CHAIN_ID})`} />
        <Diagnostic label="Source chain" value="XRPL Testnet" />
        <Diagnostic
          label="FXRP settlement"
          value={network ? `Ready · ${network.fxrp.address}` : 'Readiness check failed'}
        />
        <Diagnostic
          label="USDT0 settlement"
          value={usdt0?.available ? 'Ready' : (usdt0?.reason ?? 'Readiness check failed')}
        />
        <Diagnostic
          label="AssetManagerFXRP"
          value={network?.contracts.assetManagerFXRP ?? 'Unavailable'}
        />
        <Diagnostic
          label="Direct-mint vault"
          value={network?.directMintingPaymentAddress ?? 'Unavailable'}
        />
      </dl>
    </main>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="pm-card rounded-3xl p-6">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="pm-data mt-3 break-all text-sm font-medium text-[var(--muted-strong)]">
        {value}
      </dd>
    </div>
  );
}
