'use client';

import { useEffect } from 'react';

const SELECTOR = '[data-reveal]';

/** Adds presentation-only viewport reveals; it never reads or mutates payment state. */
export function ScrollRevealController() {
  useEffect(() => {
    const root = document.documentElement;
    const elements = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.classList.add('pm-reveal-ready');

    if (reducedMotion || !('IntersectionObserver' in window)) {
      for (const element of elements) element.dataset.revealed = 'true';
      return () => root.classList.remove('pm-reveal-ready');
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.dataset.revealed = 'true';
          observer.unobserve(element);
        }
      },
      {
        rootMargin: '0px 0px -11% 0px',
        threshold: 0.12,
      },
    );

    for (const element of elements) observer.observe(element);

    return () => {
      observer.disconnect();
      root.classList.remove('pm-reveal-ready');
    };
  }, []);

  return null;
}
