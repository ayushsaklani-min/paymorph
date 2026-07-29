import { describe, expect, it } from 'vitest';
import { selectExecutorNonce } from '../src/nonces.js';

describe('executor nonce selection', () => {
  it('starts from the Coston2 pending nonce when no reservation exists', () => {
    expect(selectExecutorNonce(12n, null)).toBe(12n);
  });

  it('allocates after the highest concurrent reservation', () => {
    expect(selectExecutorNonce(12n, 14n)).toBe(15n);
  });

  it('does not allocate below a newer pending nonce', () => {
    expect(selectExecutorNonce(18n, 14n)).toBe(18n);
  });
});
