import type { HTMLAttributes } from 'react';

export function TestnetNotice(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="note" {...props}>
      XRPL Testnet · Flare Coston2 · Test tokens have no real monetary value.
    </div>
  );
}
