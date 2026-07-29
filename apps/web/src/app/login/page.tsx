import type { Metadata } from 'next';
import { TestnetNotice } from '@paymorph/ui';
import { MerchantSignIn } from '@/features/auth/merchant-sign-in';

export const metadata: Metadata = { title: 'Merchant sign in' };

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl place-items-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8">
        <a className="text-sm text-[var(--muted)]" href="/">
          ← PayMorph
        </a>
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">Merchant sign in</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">
          Sign a one-time message with your Coston2 wallet. PayMorph never asks for your private key
          or takes custody of funds.
        </p>
        <div className="mt-8">
          <MerchantSignIn />
        </div>
        <TestnetNotice className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-[var(--muted)]" />
      </section>
    </main>
  );
}
