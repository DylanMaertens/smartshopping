import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signDeviceRequest } from './deviceAuth';

describe('device request signature', () => {
  it('produit le même HMAC SHA-256 que le serveur', () => {
    const secret = 'a'.repeat(64);
    const body = '{"list_id":"demo"}';
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const message = `1700000000000\n00000000-0000-4000-8000-000000000001\nPOST\n/api/v1/sync\n${bodyHash}`;
    const expected = createHmac('sha256', secret).update(message).digest('hex');
    expect(signDeviceRequest(
      secret, 1700000000000, '00000000-0000-4000-8000-000000000001',
      'POST', '/api/v1/sync', body,
    )).toBe(expected);
  });
});
