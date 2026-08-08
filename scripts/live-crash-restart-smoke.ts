import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '@paymorph/db';

const BROADCAST_TIMEOUT_MS = 20 * 60_000;
const SETTLEMENT_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 100;
const ACCEPTANCE_LEASE_MS = 5_000;

if (process.env.RUN_LIVE_CRASH_RESTART !== '1') {
  throw new Error('Refusing crash acceptance. Set RUN_LIVE_CRASH_RESTART=1 explicitly.');
}
if (process.env.LIVE_CRASH_EXECUTOR_EXCLUSIVE !== '1') {
  throw new Error('Stop every other PayMorph executor, then set LIVE_CRASH_EXECUTOR_EXCLUSIVE=1.');
}

const attemptId = process.env.LIVE_ATTEMPT_ID;
if (
  !attemptId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
) {
  throw new Error(
    'Set LIVE_ATTEMPT_ID to the fresh attempt UUID shown before approving the Xaman payment.',
  );
}

const initial = await db.paymentAttempt.findUnique({
  where: { id: attemptId },
  include: {
    flareSubmissions: true,
    executorNonceReservations: true,
  },
});
if (!initial) throw new Error(`Payment attempt ${attemptId} was not found`);
if (
  !['AWAITING_SIGNATURE', 'XRPL_SIGNED', 'XRPL_VALIDATED', 'FDC_REQUESTED', 'FDC_READY'].includes(
    initial.status,
  )
) {
  throw new Error(`Attempt must be fresh and pre-broadcast; current status is ${initial.status}`);
}
if (
  initial.flareTxHash ||
  initial.flareSubmissions.length > 0 ||
  initial.executorNonceReservations.length > 0
) {
  throw new Error('Attempt already has Coston2 submission state; use a fresh attempt');
}

const runId = `crash-${attemptId.slice(0, 8)}-${Date.now()}`;
let activeWorker: ChildProcess | undefined;

try {
  const firstWorker = startExecutor(`${runId}-before`);
  activeWorker = firstWorker;

  const submitted = await waitForBroadcast(attemptId, firstWorker, BROADCAST_TIMEOUT_MS);
  const observedAt = new Date();
  await forceStop(firstWorker);
  activeWorker = undefined;

  const postCrash = await loadCrashSnapshot(attemptId);
  if (postCrash.attemptStatus !== 'FDC_READY') {
    throw new Error(
      `Crash was observed too late: attempt already advanced to ${postCrash.attemptStatus}`,
    );
  }
  if (postCrash.submissionStatus !== 'SUBMITTED') {
    throw new Error(
      `Crash was observed too late: Flare submission is ${postCrash.submissionStatus}`,
    );
  }
  if (
    postCrash.flareTxHash?.toLowerCase() !== submitted.transactionHash.toLowerCase() ||
    postCrash.reservedTransactionHash?.toLowerCase() !== submitted.transactionHash.toLowerCase()
  ) {
    throw new Error('Durable attempt and nonce-reservation hashes disagree after forced stop');
  }

  const secondWorker = startExecutor(`${runId}-after`);
  activeWorker = secondWorker;
  const settled = await waitForSettlement(attemptId, secondWorker, SETTLEMENT_TIMEOUT_MS);
  await gracefulStop(secondWorker);
  activeWorker = undefined;

  const final = await loadFinalSnapshot(attemptId);
  if (
    final.flareTxHash.toLowerCase() !== submitted.transactionHash.toLowerCase() ||
    final.submissionHashes.length !== 1 ||
    final.submissionHashes[0]?.toLowerCase() !== submitted.transactionHash.toLowerCase() ||
    final.reservationHashes.length !== 1 ||
    final.reservationHashes[0]?.toLowerCase() !== submitted.transactionHash.toLowerCase() ||
    final.submitJobAttempts < 2
  ) {
    throw new Error('Restart did not settle through exactly the checkpointed transaction hash');
  }

  await runIndependentLiveVerifier(attemptId);

  const artifact = {
    verifiedAt: new Date().toISOString(),
    attemptId,
    paymentId: settled.paymentId,
    settlementAsset: settled.settlementAsset,
    forcedStop: {
      workerId: `${runId}-before`,
      broadcastTransactionHash: submitted.transactionHash,
      broadcastSubmittedAt: submitted.submittedAt.toISOString(),
      observedAt: observedAt.toISOString(),
      observationLatencyMs: Math.max(0, observedAt.getTime() - submitted.submittedAt.getTime()),
      attemptStatusAfterStop: postCrash.attemptStatus,
      submissionStatusAfterStop: postCrash.submissionStatus,
    },
    restart: {
      workerId: `${runId}-after`,
      finalStatus: settled.status,
      flareTransactionHash: final.flareTxHash,
      submitJobAttempts: final.submitJobAttempts,
      submissionCount: final.submissionHashes.length,
      reservationCount: final.reservationHashes.length,
    },
    independentVerifierArtifact: `live-smoke/${attemptId}.json`,
    warning: 'XRPL Testnet and Coston2 tokens have no real monetary value.',
  };
  await mkdir('live-smoke', { recursive: true });
  const artifactPath = join('live-smoke', `${attemptId}-crash-restart.json`);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, artifactPath, ...artifact }, null, 2));
} finally {
  if (activeWorker && activeWorker.exitCode === null) {
    await gracefulStop(activeWorker);
  }
  await db.$disconnect();
}

function startExecutor(workerId: string): ChildProcess {
  const child = spawn(
    process.execPath,
    ['--conditions=development', '--import', 'tsx', 'apps/executor/src/index.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EXECUTOR_WORKER_ID: workerId,
        EXECUTOR_BATCH_SIZE: '1',
        EXECUTOR_LEASE_MS: String(ACCEPTANCE_LEASE_MS),
        EXECUTOR_POLL_INTERVAL_MS: '250',
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  return child;
}

async function waitForBroadcast(
  id: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ transactionHash: string; submittedAt: Date }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Executor exited before Coston2 broadcast (code ${child.exitCode})`);
    }
    const submission = await db.flareSubmission.findFirst({
      where: { attemptId: id },
      orderBy: { submittedAt: 'asc' },
      select: { transactionHash: true, submittedAt: true },
    });
    if (submission) return submission;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for the durable Coston2 broadcast checkpoint');
}

async function waitForSettlement(
  id: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<{
  status: 'SETTLED';
  paymentId: string;
  settlementAsset: string;
}> {
  const deadline = Date.now() + timeoutMs;
  const terminalFailures = new Set([
    'REJECTED',
    'QUOTE_EXPIRED',
    'XRPL_FAILED',
    'EXECUTION_REVERTED',
    'RECOVERY_REQUIRED',
    'RECOVERED',
    'CANCELLED',
  ]);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Restarted executor exited before settlement (code ${child.exitCode})`);
    }
    const attempt = await db.paymentAttempt.findUnique({
      where: { id },
      select: {
        status: true,
        paymentId: true,
        invoice: { select: { settlementAsset: true } },
      },
    });
    if (!attempt) throw new Error(`Payment attempt ${id} disappeared during acceptance`);
    if (attempt.status === 'SETTLED') {
      return {
        status: 'SETTLED',
        paymentId: attempt.paymentId,
        settlementAsset: attempt.invoice.settlementAsset,
      };
    }
    if (terminalFailures.has(attempt.status)) {
      throw new Error(`Restarted attempt reached terminal status ${attempt.status}`);
    }
    await delay(500);
  }
  throw new Error('Timed out waiting for settlement after executor restart');
}

async function loadCrashSnapshot(id: string): Promise<{
  attemptStatus: string;
  flareTxHash: string | null;
  submissionStatus: string;
  reservedTransactionHash: string | null;
}> {
  const attempt = await db.paymentAttempt.findUnique({
    where: { id },
    select: {
      status: true,
      flareTxHash: true,
      flareSubmissions: {
        orderBy: { submittedAt: 'asc' },
        take: 1,
        select: { status: true },
      },
      executorNonceReservations: {
        orderBy: { generation: 'asc' },
        take: 1,
        select: { transactionHash: true },
      },
    },
  });
  if (!attempt || !attempt.flareSubmissions[0]) {
    throw new Error('Durable Coston2 submission disappeared after forced stop');
  }
  return {
    attemptStatus: attempt.status,
    flareTxHash: attempt.flareTxHash,
    submissionStatus: attempt.flareSubmissions[0].status,
    reservedTransactionHash: attempt.executorNonceReservations[0]?.transactionHash ?? null,
  };
}

async function loadFinalSnapshot(id: string): Promise<{
  flareTxHash: string;
  submissionHashes: string[];
  reservationHashes: string[];
  submitJobAttempts: number;
}> {
  const attempt = await db.paymentAttempt.findUnique({
    where: { id },
    select: {
      flareTxHash: true,
      flareSubmissions: {
        orderBy: { submittedAt: 'asc' },
        select: { transactionHash: true },
      },
      executorNonceReservations: {
        orderBy: { generation: 'asc' },
        select: { transactionHash: true },
      },
      jobs: {
        where: { jobType: 'SUBMIT_FLARE' },
        orderBy: { generation: 'asc' },
        select: { attempts: true },
      },
    },
  });
  if (!attempt?.flareTxHash) throw new Error('Settled attempt lacks a Coston2 transaction hash');
  return {
    flareTxHash: attempt.flareTxHash,
    submissionHashes: attempt.flareSubmissions.map((item) => item.transactionHash),
    reservationHashes: attempt.executorNonceReservations.flatMap((item) =>
      item.transactionHash ? [item.transactionHash] : [],
    ),
    submitJobAttempts: attempt.jobs.reduce((total, item) => total + item.attempts, 0),
  };
}

async function forceStop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGKILL');
  await waitForExit(child, 10_000);
}

async function gracefulStop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  try {
    await waitForExit(child, 10_000);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, 10_000);
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Executor did not exit in time')), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function runIndependentLiveVerifier(id: string): Promise<void> {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(command, ['test:live'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_URL: process.env.LIVE_VERIFY_APP_URL ?? 'http://localhost:3000',
      RUN_LIVE_TESTNET: '1',
      LIVE_ATTEMPT_ID: id,
    },
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Independent live verifier exited with code ${exitCode}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
