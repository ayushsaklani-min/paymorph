import { requireMerchant } from '@/lib/server/auth/session';
import { ProductJourney } from '@/features/guides/product-journey';
import { PRODUCT_JOURNEYS } from '@/features/guides/product-journeys';
import { PosTerminal } from '@/features/pos/pos-terminal';
export default async function PosPage() {
  const merchant = await requireMerchant();
  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <PosTerminal merchantAddress={merchant.walletAddress} />
      <ProductJourney journey={PRODUCT_JOURNEYS.pos} />
    </main>
  );
}
