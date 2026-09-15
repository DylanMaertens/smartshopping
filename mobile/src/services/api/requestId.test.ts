import { describe, expect, it } from 'vitest';
import { isUuidV4 } from '@/services/identity/deviceIdentity';
import { createRequestId } from './requestId';

describe('createRequestId', () => {
  it('crée un UUID v4 distinct pour corréler chaque requête', () => {
    const first = createRequestId();
    const second = createRequestId();
    expect(isUuidV4(first)).toBe(true);
    expect(isUuidV4(second)).toBe(true);
    expect(second).not.toBe(first);
  });
});
