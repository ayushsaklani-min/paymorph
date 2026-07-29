import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PayMorph',
    template: '%s · PayMorph',
  },
  description: 'Pay in XRP. Settle in programmable FXRP or USDT0 on Flare.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
