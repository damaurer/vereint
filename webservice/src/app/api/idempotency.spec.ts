import { describe, expect, it } from 'vitest';
import { RetryableIdempotencyKey } from './idempotency';

describe('RetryableIdempotencyKey', () => {
  const payload = { memberId: 'm-1', amount: '5.00' };

  it('gives every attempt a new key while nothing failed', () => {
    const keys = new RetryableIdempotencyKey();
    expect(keys.for(payload)).not.toBe(keys.for(payload));
  });

  it('reuses the key of a failed attempt with the same data until reset', () => {
    const keys = new RetryableIdempotencyKey();
    const first = keys.for(payload);
    keys.failed(payload, first);
    expect(keys.for(payload)).toBe(first);
    keys.reset();
    expect(keys.for(payload)).not.toBe(first);
  });

  it('creates a new key when the data changes after a failure', () => {
    const keys = new RetryableIdempotencyKey();
    const first = keys.for(payload);
    keys.failed(payload, first);
    expect(keys.for({ ...payload, amount: '6.00' })).not.toBe(first);
  });
});
