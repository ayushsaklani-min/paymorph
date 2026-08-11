'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const DISPLAY_MS = 1_900;
const EXIT_MS = 460;
const REDUCED_MOTION_DISPLAY_MS = 650;

export function LandingSplash() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('pm-splash-active');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const displayMs = reducedMotion ? REDUCED_MOTION_DISPLAY_MS : DISPLAY_MS;
    const exitMs = reducedMotion ? 0 : EXIT_MS;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const exitTimer = setTimeout(() => {
      setLeaving(true);
      hideTimer = setTimeout(() => {
        setVisible(false);
        root.classList.remove('pm-splash-active');
      }, exitMs);
    }, displayMs);

    return () => {
      clearTimeout(exitTimer);
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      root.classList.remove('pm-splash-active');
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <div
        aria-busy="true"
        aria-label="Loading PayMorph"
        className="pm-landing-splash"
        data-state={leaving ? 'leaving' : 'visible'}
        role="status"
      >
        <div className="pm-splash-aura" aria-hidden="true" />
        <div className="pm-splash-content">
          <div className="pm-splash-logo-window">
            <Image
              alt="PayMorph"
              className="pm-splash-logo-image"
              draggable={false}
              height={1254}
              priority
              src="/paymorph-logo.png"
              width={1254}
            />
          </div>
          <div className="pm-splash-loading" aria-hidden="true">
            <span>Loading PayMorph</span>
            <span className="pm-splash-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="pm-splash-progress" aria-hidden="true">
            <span />
          </div>
          <p className="pm-splash-caption">Preparing evidence-first payments</p>
        </div>
      </div>
      <noscript>
        <style>{`.pm-landing-splash{display:none!important}`}</style>
      </noscript>
    </>
  );
}
