import { beforeEach, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { canConfigureTestServer, getTestServerUrl, normalizeTestServerUrl, verifyAndSaveTestServer } from './testServer';
const extra = vi.hoisted(() => ({ distributionChannel: 'preview', testServerConfiguration: true }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra } } }));
beforeEach(async () => {
  extra.distributionChannel = 'preview'; extra.testServerConfiguration = true;
  await SecureStore.deleteItemAsync('smartshopping-test-api-url');
  vi.stubGlobal('fetch', vi.fn());
});
it('accepts a tunnel address with or without the API path and rejects unsafe or unrelated paths', () => {
  expect(normalizeTestServerUrl(' https://example.trycloudflare.com/ ')).toBe('https://example.trycloudflare.com/api/v1');
  expect(normalizeTestServerUrl('https://example.trycloudflare.com/api/v1/')).toBe('https://example.trycloudflare.com/api/v1');
  for (const url of ['http://example.org', 'https://a:b@example.org', 'https://example.org?token=x', 'https://example.org/#', 'https://localhost', 'https://127.0.0.1', 'https://example.org/foo', 'https://example.org:8443']) {
    expect(() => normalizeTestServerUrl(url)).toThrow();
  }
});
it('persists only a reachable endpoint and sends no device credentials during verification', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{"status":"ok"}'));
  await verifyAndSaveTestServer('https://example.org');
  expect(getTestServerUrl()).toBe('https://example.org/api/v1');
  expect(fetch).toHaveBeenCalledWith('https://example.org/health', { signal: expect.any(AbortSignal), redirect: 'error' });
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await expect(verifyAndSaveTestServer('https://new.example.org')).rejects.toThrow(/inaccessible/);
  expect(getTestServerUrl()).toBe('https://example.org/api/v1');
});
it('cannot override a production build even when a preview address remains in storage', async () => {
  SecureStore.setItem('smartshopping-test-api-url', 'https://test.example.org/api/v1');
  extra.distributionChannel = 'direct';
  expect(canConfigureTestServer()).toBe(false);
  expect(getTestServerUrl()).toBeNull();
  await expect(verifyAndSaveTestServer('https://test.example.org')).rejects.toThrow(/réservé/);
  expect(fetch).not.toHaveBeenCalled();
});
