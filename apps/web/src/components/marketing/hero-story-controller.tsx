'use client';

import { useEffect } from 'react';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function smoothStep(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

function applyLinePosition(line: HTMLElement, distance: number) {
  const visibility = 1 - smoothStep(0.18, 0.82, Math.abs(distance));
  const verticalOffset = clamp(Math.abs(distance)) * Math.sign(distance) * 0.62;

  line.style.setProperty('--hero-line-opacity', visibility.toFixed(3));
  line.style.setProperty('--hero-line-y', `${verticalOffset.toFixed(3)}em`);
  line.style.setProperty('--hero-line-scale', (0.965 + visibility * 0.035).toFixed(3));
  line.style.setProperty('--hero-line-blur', `${((1 - visibility) * 11).toFixed(2)}px`);
}

/** Drives the landing headline from scroll position without touching payment state. */
export function HeroStoryController() {
  useEffect(() => {
    const root = document.documentElement;
    const hero = document.querySelector<HTMLElement>('[data-hero-story]');
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-hero-line]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!hero || lines.length !== 3 || reducedMotion) return;

    let animationFrame = 0;

    const render = () => {
      animationFrame = 0;
      const rect = hero.getBoundingClientRect();
      const scrollRange = Math.max(hero.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-rect.top / scrollRange);
      const compact = window.innerWidth <= 1050;
      const timelinePosition = (compact ? clamp(progress / 0.24) : progress) * 2;

      lines.forEach((line, index) => applyLinePosition(line, index - timelinePosition));
      hero.style.setProperty('--hero-scroll-progress', progress.toFixed(4));
      hero.dataset.heroStage = String(Math.min(2, Math.max(0, Math.round(timelinePosition))));
    };

    const scheduleRender = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(render);
    };

    root.classList.add('pm-hero-story-ready');
    render();
    window.addEventListener('scroll', scheduleRender, { passive: true });
    window.addEventListener('resize', scheduleRender);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', scheduleRender);
      window.removeEventListener('resize', scheduleRender);
      root.classList.remove('pm-hero-story-ready');
    };
  }, []);

  return null;
}
