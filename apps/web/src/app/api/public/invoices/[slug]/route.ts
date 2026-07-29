import { db, InvoiceStatus } from '@paymorph/db';
import { DomainError, formatBaseUnits } from '@paymorph/shared';
import { jsonError, jsonSuccess } from '@/lib/server/http';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const invoice = await db.invoice.findUnique({
      where: { publicSlug: slug },
      include: {
        merchant: { select: { displayName: true, logoUrl: true } },
        recipients: { orderBy: { position: 'asc' } },
      },
    });
    if (!invoice || invoice.status !== InvoiceStatus.ACTIVE || invoice.expiresAt <= new Date()) {
      throw new DomainError('INVOICE_NOT_ACTIVE', 'Invoice is not active');
    }
    const decimals = invoice.denomination === 'XRP' ? 6 : 2;
    return jsonSuccess(request, {
      slug: invoice.publicSlug,
      title: invoice.title,
      description: invoice.description,
      externalRef: invoice.externalRef,
      merchant: invoice.merchant,
      denomination: invoice.denomination,
      amountDisplay: formatBaseUnits(BigInt(invoice.amountBaseUnits.toFixed(0)), decimals),
      settlementAsset: invoice.settlementAsset,
      expiresAt: invoice.expiresAt,
      recipients: invoice.recipients.map((recipient) => ({
        label: recipient.label,
        addressMasked: `${recipient.address.slice(0, 6)}…${recipient.address.slice(-4)}`,
        bps: recipient.bps,
      })),
      status: invoice.status,
      network: { source: 'XRPL_TESTNET', destination: 'COSTON2' },
      testnet: true,
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
