import { db } from '../packages/db/src/index.js';

async function main(): Promise<void> {
  const now = new Date();
  const [rateLimits, idempotencyClaims, authNonces, merchantSessions] = await db.$transaction([
    db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.authNonce.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  process.stdout.write(
    `${JSON.stringify({
      cleanedAt: now.toISOString(),
      deleted: {
        rateLimitBuckets: rateLimits.count,
        idempotencyRecords: idempotencyClaims.count,
        authNonces: authNonces.count,
        merchantSessions: merchantSessions.count,
      },
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
