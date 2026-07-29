import { db, Denomination, InvoiceStatus, SettlementAsset } from '../packages/db/src/index.js';

const merchant = await db.merchant.upsert({
  where: { walletAddress: '0x1111111111111111111111111111111111111111' },
  update: {
    displayName: 'PayMorph Demo Store',
    defaultAsset: SettlementAsset.FXRP,
  },
  create: {
    id: '10000000-0000-4000-8000-000000000001',
    walletAddress: '0x1111111111111111111111111111111111111111',
    displayName: 'PayMorph Demo Store',
    defaultAsset: SettlementAsset.FXRP,
  },
});

const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
const invoice = await db.$transaction(async (transaction) => {
  const record = await transaction.invoice.upsert({
    where: { publicSlug: 'demo-fxrp-checkout' },
    update: {
      merchantId: merchant.id,
      title: 'Demo FXRP checkout',
      description: 'A tiny XRP Testnet payment settled as FXRP on Coston2.',
      denomination: Denomination.XRP,
      amountBaseUnits: '1000000',
      settlementAsset: SettlementAsset.FXRP,
      status: InvoiceStatus.ACTIVE,
      expiresAt,
      publishedAt: new Date(),
      cancelledAt: null,
    },
    create: {
      id: '20000000-0000-4000-8000-000000000001',
      merchantId: merchant.id,
      publicSlug: 'demo-fxrp-checkout',
      title: 'Demo FXRP checkout',
      description: 'A tiny XRP Testnet payment settled as FXRP on Coston2.',
      externalRef: 'DEMO-FXRP-001',
      denomination: Denomination.XRP,
      amountBaseUnits: '1000000',
      settlementAsset: SettlementAsset.FXRP,
      status: InvoiceStatus.ACTIVE,
      expiresAt,
      publishedAt: new Date(),
    },
  });
  await transaction.invoiceRecipient.deleteMany({ where: { invoiceId: record.id } });
  await transaction.invoiceRecipient.create({
    data: {
      invoiceId: record.id,
      position: 0,
      label: 'Demo treasury',
      address: '0x2222222222222222222222222222222222222222',
      bps: 10_000,
    },
  });
  return record;
});

console.log(
  JSON.stringify(
    {
      merchantId: merchant.id,
      invoiceId: invoice.id,
      checkout: `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/pay/${invoice.publicSlug}`,
      warning: 'XRPL Testnet and Coston2 tokens have no real monetary value.',
    },
    null,
    2,
  ),
);

await db.$disconnect();
