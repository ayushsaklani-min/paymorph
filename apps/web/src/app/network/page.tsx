import type { Metadata } from 'next';
import { COSTON2_CHAIN_ID } from '@paymorph/shared';
import { resolveConfiguredNetwork } from '@/lib/server/network';

export const metadata: Metadata = { title: 'Network diagnostics' };

export const dynamic = 'force-dynamic';

export default async function NetworkPage() {
  const network = await resolveConfiguredNetwork().catch(() => null);
  const usdt0 = network?.capabilities.USDT0;
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <a className="text-sm text-[var(--muted)]" href="/">
        ← PayMorph
      </a>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight">Network diagnostics</h1>
      <p className="mt-4 text-[var(--muted)]">
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
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-2 font-medium">{value}</dd>
    </div>
  );
}
