'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { ProductJourney as ProductJourneyModel, ProtocolMark } from './product-journeys';

const MARK_ASSETS: Record<Exclude<ProtocolMark, 'paymorph'>, { alt: string; src: string }> = {
  xaman: { alt: 'Xaman', src: '/media/protocol/xaman.svg' },
  xrp: { alt: 'XRP', src: '/media/protocol/xrp.png' },
  fdc: { alt: 'Flare Data Connector', src: '/media/protocol/fdc.svg' },
  fassets: { alt: 'Flare FAssets', src: '/media/protocol/fassets.svg' },
  flare: { alt: 'Flare', src: '/media/protocol/flare.svg' },
  usdt0: { alt: 'USDT0', src: '/media/protocol/usdt0.svg' },
};

export function ProductJourney({ journey }: { journey: ProductJourneyModel }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepElements = useRef<Array<HTMLLIElement | null>>([]);
  const activeStep = journey.steps[activeIndex] ?? journey.steps[0];
  const progress = ((activeIndex + 1) / journey.steps.length) * 100;
  const headingId = `${journey.id}-heading`;

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) return;
        const nextIndex = Number((visible.target as HTMLElement).dataset.stepIndex);
        if (Number.isInteger(nextIndex)) setActiveIndex(nextIndex);
      },
      {
        rootMargin: '-31% 0px -42% 0px',
        threshold: [0, 0.2, 0.45, 0.7],
      },
    );

    for (const element of stepElements.current) {
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [journey.id]);

  return (
    <section aria-labelledby={headingId} className="pm-product-journey" id={journey.id}>
      <header className="pm-product-journey-header">
        <div>
          <p className="pm-kicker">{journey.eyebrow}</p>
          <h2 className="pm-display" id={headingId}>
            {journey.title}
          </h2>
        </div>
        <p>{journey.introduction}</p>
      </header>

      <div className="pm-product-journey-grid">
        <aside className="pm-product-journey-stage">
          <div aria-hidden="true" className="pm-product-journey-orbit">
            <span className="pm-product-journey-orbit-core">
              <ProtocolMarks marks={activeStep.marks} presentation="stage" />
            </span>
            <span className="pm-product-journey-orbit-ring" />
            <span className="pm-product-journey-orbit-dot" />
          </div>

          <div className="pm-product-journey-stage-copy">
            <p className="pm-product-journey-stage-count">
              <span>{String(activeIndex + 1).padStart(2, '0')}</span>
              <span aria-hidden="true">/</span>
              <span>{String(journey.steps.length).padStart(2, '0')}</span>
            </p>
            <p className="pm-product-journey-stage-label">{activeStep.label}</p>
            <h3>{activeStep.title}</h3>
            <p>{activeStep.checkpoint}</p>
          </div>

          <div
            aria-label={`Journey progress: step ${activeIndex + 1} of ${journey.steps.length}`}
            aria-valuemax={journey.steps.length}
            aria-valuemin={1}
            aria-valuenow={activeIndex + 1}
            className="pm-product-journey-progress"
            role="progressbar"
          >
            <span style={{ width: `${progress}%` }} />
          </div>

          <p className="pm-product-journey-outcome">
            <span aria-hidden="true">✓</span>
            {journey.outcome}
          </p>
        </aside>

        <ol className="pm-product-journey-steps">
          {journey.steps.map((step, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                aria-current={isActive ? 'step' : undefined}
                className="pm-product-journey-step"
                data-active={isActive ? 'true' : 'false'}
                data-step-index={index}
                key={step.id}
                ref={(element) => {
                  stepElements.current[index] = element;
                }}
              >
                <div aria-hidden="true" className="pm-product-journey-step-index">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div>
                  <div className="pm-product-journey-step-heading">
                    <p className="pm-product-journey-step-label">{step.label}</p>
                    <ProtocolMarks marks={step.marks} presentation="card" />
                  </div>
                  <h3>{step.title}</h3>
                  <p className="pm-product-journey-step-description">{step.description}</p>
                  <p className="pm-product-journey-checkpoint">
                    <span aria-hidden="true" />
                    {step.checkpoint}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function ProtocolMarks({
  marks,
  presentation,
}: {
  marks: readonly ProtocolMark[] | undefined;
  presentation: 'card' | 'stage';
}) {
  const visibleMarks = marks?.length ? marks : (['paymorph'] as const);

  return (
    <span className="pm-product-journey-marks" data-presentation={presentation}>
      {visibleMarks.map((mark) => {
        if (mark === 'paymorph') {
          return (
            <span className="pm-product-journey-paymorph-mark" key={mark} title="PayMorph">
              P
            </span>
          );
        }

        const asset = MARK_ASSETS[mark];
        return (
          <span className="pm-product-journey-mark" key={mark} title={asset.alt}>
            <Image alt={asset.alt} height={56} src={asset.src} width={96} />
          </span>
        );
      })}
    </span>
  );
}
