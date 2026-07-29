import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { TestnetNotice } from '@paymorph/ui';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const merchant = await requireMerchant().catch(() => null);
  if (!merchant) redirect('/login');

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <a className="text-lg font-semibold" href="/dashboard">
          PayMorph
        </a>
        <nav aria-label="Merchant">
          <ul className="flex gap-5 text-sm text-[var(--muted)]">
            <li>
              <a href="/dashboard/invoices">Invoices</a>
            </li>
            <li>
              <a href="/dashboard/payments">Payments</a>
            </li>
            <li>
              <a href="/dashboard/settings">{merchant.displayName}</a>
            </li>
          </ul>
        </nav>
      </header>
      <TestnetNotice className="mt-5 rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]" />
      {children}
    </div>
  );
}
