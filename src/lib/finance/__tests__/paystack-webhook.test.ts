import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { verifyPaystackSignature } from '../paystack-webhook';

describe('paystack webhook signature', () => {
  it('accepts a valid signature', () => {
    const secret = 'test-secret';
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it('accepts a sha512=-prefixed signature', () => {
    const secret = 'test-secret';
    const body = '{"event":"charge.success"}';
    const signature = `sha512=${createHmac('sha512', secret).update(body).digest('hex')}`;
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyPaystackSignature('{"event":"x"}', 'bad', 'test-secret')).toBe(false);
  });
});
