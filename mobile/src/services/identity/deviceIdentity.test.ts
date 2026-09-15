import { describe, expect, it } from 'vitest';
import { getAnonymousDeviceId, isUuidV4, rotateAnonymousDeviceId } from './deviceIdentity';

describe('anonymous device identity', () => {
  it('génère un UUID v4 stable sans information personnelle', async () => {
    const first = await getAnonymousDeviceId();
    const second = await getAnonymousDeviceId();
    expect(isUuidV4(first)).toBe(true);
    expect(second).toBe(first);
  });

  it('refuse les identifiants qui ne sont pas des UUID v4', () => {
    expect(isUuidV4('1234')).toBe(false);
    expect(isUuidV4('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
  });

  it('permet une rotation explicite de l’identité locale', async () => {
    const before = await getAnonymousDeviceId();
    const rotated = await rotateAnonymousDeviceId();
    expect(isUuidV4(rotated)).toBe(true);
    expect(rotated).not.toBe(before);
    expect(await getAnonymousDeviceId()).toBe(rotated);
  });
});
