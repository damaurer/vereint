import { describe, expect, it } from 'vitest';
import { RetryableIdempotencyKey } from './idempotency';

describe('RetryableIdempotencyKey', () => {
  it('keeps the key for the same data until reset', () => {
    const keys = new RetryableIdempotencyKey();
    const first = keys.for({ memberId: 'm-1', amount: '5.00' });
    expect(keys.for({ memberId: 'm-1', amount: '5.00' })).toBe(first);
    keys.reset();
    expect(keys.for({ memberId: 'm-1', amount: '5.00' })).not.toBe(first);
  });

  it('creates a new key when the data changes', () => {
    const keys = new RetryableIdempotencyKey();
    const first = keys.for({ memberId: 'm-1', amount: '5.00' });
    expect(keys.for({ memberId: 'm-1', amount: '6.00' })).not.toBe(first);
  });
});
