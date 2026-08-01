import type { Metadata } from 'next';
import { TestnetNotice } from '@paymorph/ui';
import { MerchantSignIn } from '@/features/auth/merchant-sign-in';

export const metadata: Metadata = { title: 'Merchant sign in' };

export default function LoginPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="pm-shell mx-auto grid min-h-screen max-w-5xl place-items-center px-6 py-12"
    >
      <section className="pm-panel pm-editorial-nav w-full max-w-md rounded-[2rem] p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <a
            className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
            href="/"
          >
            ← PayMorph
          </a>
          <span className="pm-data rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">
            Coston2
          </span>
        </div>
        <p className="pm-kicker mt-10">Merchant access</p>
        <h1 className="pm-display mt-4 text-4xl">Welcome to the console.</h1>
        <p className="mt-4 leading-7 text-[var(--muted-strong)]">
          Sign a one-time message with your Coston2 wallet. PayMorph never asks for your private key
          or takes custody of funds.
        </p>
        <div className="mt-8 rounded-2xl border border-white/[0.07] bg-black/15 p-1">
          <MerchantSignIn />
        </div>
        <TestnetNotice className="mt-6 rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/[0.045] p-4 text-sm text-[var(--muted)]" />
      </section>
    </main>
  );
}
