import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
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
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="extension-hydration-guard" strategy="beforeInteractive">
          {`
            (() => {
              const injectedAttribute = (name) =>
                name === 'bis_skin_checked' || name.startsWith('__processed_ddc');
              const clean = (node) => {
                if (!(node instanceof Element)) return;
                const elements = [node, ...node.querySelectorAll('*')];
                for (const element of elements) {
                  for (const attribute of [...element.attributes]) {
                    if (injectedAttribute(attribute.name)) element.removeAttribute(attribute.name);
                  }
                }
              };
              clean(document.documentElement);
              const observer = new MutationObserver((records) => {
                for (const record of records) {
                  if (record.type === 'attributes' && injectedAttribute(record.attributeName || '')) {
                    record.target.removeAttribute(record.attributeName);
                  }
                  for (const node of record.addedNodes) clean(node);
                }
              });
              observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
              window.setTimeout(() => observer.disconnect(), 1500);
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
