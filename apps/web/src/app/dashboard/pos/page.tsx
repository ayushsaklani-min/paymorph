import { requireMerchant } from '@/lib/server/auth/session';
import { PosTerminal } from '@/features/pos/pos-terminal';
export default async function PosPage() {
  const merchant = await requireMerchant();
  return (
    <main className="py-12">
      <PosTerminal merchantAddress={merchant.walletAddress} />
    </main>
  );
}
