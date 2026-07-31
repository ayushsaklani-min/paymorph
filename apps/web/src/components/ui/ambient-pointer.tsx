'use client';

import { useEffect } from 'react';

/** A decorative cursor glow. It never participates in payment state or input. */
export function AmbientPointer() {
  useEffect(() => {
    const root = document.documentElement;
    const updatePointer = (event: PointerEvent) => {
      root.style.setProperty('--pointer-x', `${event.clientX}px`);
      root.style.setProperty('--pointer-y', `${event.clientY}px`);
    };
    window.addEventListener('pointermove', updatePointer, { passive: true });
    return () => window.removeEventListener('pointermove', updatePointer);
  }, []);

  return <div aria-hidden="true" className="pm-pointer-aura" />;
}
