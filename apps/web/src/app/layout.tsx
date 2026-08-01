import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { AmbientPointer } from '@/components/ui/ambient-pointer';
import { EmberEarth } from '@/components/ui/ember-earth';
import { SkipToContent } from '@/components/ui/skip-to-content';
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
              const extensionTransportMessage =
                'Could not establish connection. Receiving end does not exist.';
              const extensionErrorMessage = (value) => {
                if (typeof value === 'string') return value;
                if (value && typeof value === 'object' && typeof value.message === 'string') {
                  return value.message;
                }
                return '';
              };
              const suppressKnownExtensionTransportError = (event) => {
                const value = event.type === 'unhandledrejection' ? event.reason : event.message;
                if (!extensionErrorMessage(value).includes(extensionTransportMessage)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
              };
              window.addEventListener('error', suppressKnownExtensionTransportError, true);
              window.addEventListener('unhandledrejection', suppressKnownExtensionTransportError, true);

              const injectedAttribute = (name) =>
                name === 'bis_skin_checked' ||
                name === 'bis_register' ||
                name.startsWith('__processed_ddc');
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

              // A fixed delay can expire before a cold development page hydrates.
              // Keep the guard through the complete load/hydration window, then
              // disconnect so it has no steady-state cost for the application.
              const finish = () => {
                clean(document.documentElement);
                window.setTimeout(() => observer.disconnect(), 5000);
              };
              document.addEventListener('DOMContentLoaded', () => clean(document.documentElement), {
                once: true,
              });
              if (document.readyState === 'complete') finish();
              else window.addEventListener('load', finish, { once: true });
            })();
          `}
        </Script>
        <SkipToContent />
        <AmbientPointer />
        <EmberEarth />
        <div className="pm-app-root">{children}</div>
      </body>
    </html>
  );
}
