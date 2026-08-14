import { describe, expect, it } from 'vitest';
import { PRODUCT_JOURNEY_KEYS, PRODUCT_JOURNEYS } from '../src/features/guides/product-journeys.js';

describe('merchant product journeys', () => {
  it('covers every primary merchant surface with a concise ordered story', () => {
    expect(Object.keys(PRODUCT_JOURNEYS)).toEqual(PRODUCT_JOURNEY_KEYS);

    for (const key of PRODUCT_JOURNEY_KEYS) {
      const journey = PRODUCT_JOURNEYS[key];
      expect(journey.steps.length).toBeGreaterThanOrEqual(3);
      expect(journey.steps.length).toBeLessThanOrEqual(5);
      expect(new Set(journey.steps.map((step) => step.id)).size).toBe(journey.steps.length);

      for (const step of journey.steps) {
        expect(step.title.length).toBeGreaterThan(12);
        expect(step.description.length).toBeGreaterThan(30);
        expect(step.checkpoint.length).toBeGreaterThan(20);
      }
    }
  });

  it('preserves the evidence-first payment boundary in its visible sequence', () => {
    const paymentJourney = PRODUCT_JOURNEYS.payments;

    expect(paymentJourney.steps.map((step) => step.id)).toEqual([
      'xaman',
      'xrpl',
      'fdc',
      'settlement',
      'receipt',
    ]);
    expect(paymentJourney.steps.map((step) => step.marks)).toEqual([
      ['xaman'],
      ['xrp'],
      ['fdc', 'flare'],
      ['fassets', 'usdt0'],
      ['paymorph'],
    ]);
    expect(paymentJourney.steps.at(-1)?.description).toContain('PaymentSettled');
  });

  it('keeps limited product surfaces honest in the educational copy', () => {
    const requestCopy = JSON.stringify(PRODUCT_JOURNEYS.paymentRequests);
    const developerCopy = JSON.stringify(PRODUCT_JOURNEYS.developers);
    const treasuryCopy = JSON.stringify(PRODUCT_JOURNEYS.treasury);
    const marketplaceCopy = JSON.stringify(PRODUCT_JOURNEYS.marketplace);
    const settingsCopy = JSON.stringify(PRODUCT_JOURNEYS.settings);

    expect(requestCopy).toContain('does not currently send email');
    expect(developerCopy).toContain('not a published SDK');
    expect(treasuryCopy).toContain('latest 50 settled attempts');
    expect(marketplaceCopy).toContain('not an order book, escrow service');
    expect(settingsCopy).toContain('only when the configured real route passes health checks');
  });
});
