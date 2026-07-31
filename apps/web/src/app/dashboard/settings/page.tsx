import { requireMerchant } from '@/lib/server/auth/session';
import { MerchantProfileForm } from '@/features/settings/merchant-profile-form';

export default async function SettingsPage() {
  const merchant = await requireMerchant();
  return (
    <main className="py-12">
      <p className="text-sm text-[var(--muted)]">Merchant account</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-3 font-mono text-sm text-[var(--muted)]">{merchant.walletAddress}</p>
      <MerchantProfileForm
        defaultAsset={merchant.defaultAsset}
        displayName={merchant.displayName}
        logoUrl={merchant.logoUrl}
        webhookUrl={merchant.webhookUrl}
      />
    </main>
  );
}
