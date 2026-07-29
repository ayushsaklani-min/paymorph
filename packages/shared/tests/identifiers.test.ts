import { describe, expect, it } from 'vitest';
import { createPaymentId } from '../src/domain/identifiers.js';

describe('payment identifier', () => {
  it('is deterministic without depending on its containing user operation', () => {
    const input = {
      chainDomain: 'PAYMORPH:XRPL_TESTNET:COSTON2:V1',
      invoiceId: 'invoice-1',
      quoteId: 'quote-1',
      payerXrplAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    };
    expect(createPaymentId(input)).toBe(createPaymentId(input));
    expect(createPaymentId(input)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
