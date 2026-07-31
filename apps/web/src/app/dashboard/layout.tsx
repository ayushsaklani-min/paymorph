import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { TestnetNotice } from '@paymorph/ui';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const merchant = await requireMerchant().catch(() => null);
  if (!merchant) redirect('/login');

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a
            className="flex items-center gap-3 text-lg font-semibold tracking-tight"
            href="/dashboard"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]">
              P
            </span>
            PayMorph
          </a>
          <a
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            href="/dashboard/settings"
          >
            {merchant.displayName}
          </a>
        </div>
        <nav aria-label="Merchant" className="mt-5 overflow-x-auto">
          <ul className="flex min-w-max gap-2 text-sm">
            {[
              ['Overview', '/dashboard'],
              ['Payments', '/dashboard/payments'],
              ['Invoices', '/dashboard/invoices'],
              ['Network', '/network'],
              ['Settings', '/dashboard/settings'],
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  className="inline-flex rounded-full border border-transparent px-3 py-2 text-[var(--muted)] transition hover:border-[var(--line)] hover:bg-white/[0.035] hover:text-[var(--ink)]"
                  href={href}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <TestnetNotice className="mt-5 rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]" />
      {children}
    </div>
  );
}
