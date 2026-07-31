import { db } from '@paymorph/db';
import { jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { z } from 'zod';

const inputSchema = z.strictObject({
  eventType: z.enum(['VIEW', 'CHECKOUT_STARTED']),
  eventKey: z.uuid(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const input = inputSchema.parse(await readJson(request));
    const link = await db.paymentLink.findUnique({
      where: { slug: (await params).slug },
      select: { id: true },
    });
    if (!link) return jsonSuccess(request, { recorded: false });
    await db.paymentLinkAnalyticsEvent.upsert({
      where: {
        paymentLinkId_eventType_eventKey: {
          paymentLinkId: link.id,
          eventType: input.eventType,
          eventKey: input.eventKey,
        },
      },
      update: {},
      create: { paymentLinkId: link.id, eventType: input.eventType, eventKey: input.eventKey },
    });
    return jsonSuccess(request, { recorded: true });
  } catch (error) {
    return jsonError(request, error);
  }
}
