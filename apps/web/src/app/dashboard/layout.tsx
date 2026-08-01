import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { TestnetNotice } from '@paymorph/ui';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const merchant = await requireMerchant().catch(() => null);
  if (!merchant) redirect('/login');

  return (
    <div className="pm-shell pm-dashboard mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
      <header className="pm-panel pm-editorial-nav sticky top-3 z-10 rounded-2xl px-4 py-3 sm:top-5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a className="pm-brand" href="/dashboard">
            <span aria-hidden="true" className="pm-logo-mark">
              <span>P</span>
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
              <span className="pm-data block text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Merchant console
              </span>
            </span>
          </a>
          <a
            className="pm-button pm-button-secondary rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--muted-strong)]"
            href="/dashboard/settings"
          >
            {merchant.displayName}
          </a>
        </div>
        <nav aria-label="Merchant" className="mt-4 overflow-x-auto pb-0.5">
          <ul className="flex min-w-max gap-1.5 text-sm">
            {[
              ['Overview', '/dashboard'],
              ['Payments', '/dashboard/payments'],
              ['Invoices', '/dashboard/invoices'],
              ['Payment links', '/dashboard/payment-links'],
              ['Requests', '/dashboard/payment-requests'],
              ['POS', '/dashboard/pos'],
              ['Developers', '/dashboard/developers'],
              ['Treasury', '/dashboard/treasury'],
              ['Marketplace', '/dashboard/marketplace'],
              ['Network', '/network'],
              ['Settings', '/dashboard/settings'],
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  className="inline-flex rounded-lg border border-transparent px-3 py-2 text-[var(--muted)] transition duration-300 hover:border-[var(--line-strong)] hover:bg-[var(--accent)]/[0.07] hover:text-[var(--ink)]"
                  href={href}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <TestnetNotice className="mt-5 rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/[0.045] px-4 py-3 text-sm text-[var(--muted)]" />
      {children}
    </div>
  );
}
