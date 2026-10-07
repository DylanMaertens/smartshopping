import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCache } from '@/services/cache/sqliteProductCache';
import { getCommunitySuggestions, getProduct, syncList, recognizeListPhoto, reportCommunityProposal, getValidatedCommunityFields } from './backend';
import { getDeviceAuthSecret, storeDeviceAuthSecret, signDeviceRequest } from '@/services/identity/deviceAuth';

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/services/cache/sqliteProductCache', () => ({ ProductCache: { get: vi.fn(() => null), set: vi.fn() } }));
vi.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'device-a' }));
vi.mock('@/services/identity/deviceAuth', () => ({
  getDeviceAuthSecret: vi.fn(), storeDeviceAuthSecret: vi.fn(), signDeviceRequest: vi.fn(() => 'signature'),
}));
const payload = { list_id: 'list', items: [], last_sync: 0 };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(getDeviceAuthSecret).mockReturnValue(null); vi.mocked(ProductCache.get).mockReturnValue(null); });
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('API deadlines and device enrollment', () => {
  it('bounds product lookup even when enrollment never responds', async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);
    const request = expect(getProduct('3017620422003')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(22000);
    await request;
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4500);
    expect(fetch.mock.calls[0]).toBeDefined();
    expect(storeDeviceAuthSecret).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows another enrollment attempt after a timeout', async () => {
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(response({ device_id: 'device-a', secret: 'secret-a' }))
      .mockResolvedValueOnce(response({ list_id: 'list' }));
    vi.stubGlobal('fetch', fetch);
    const failed = expect(syncList('device-a', payload)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(8000);
    await failed;
    await expect(syncList('device-a', payload)).resolves.toEqual({ list_id: 'list' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('shares enrollment only for the same device', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const deviceId = new Headers(options.headers).get('X-Device-Id');
      return response(url.endsWith('/register') ? { device_id: deviceId, secret: `secret-${deviceId}` } : {});
    }));
    await Promise.all([syncList('device-a', payload), syncList('device-a', payload), syncList('device-b', payload)]);
    expect(storeDeviceAuthSecret).toHaveBeenCalledTimes(2);
    expect(signDeviceRequest).toHaveBeenCalledWith('secret-device-b', expect.any(Number), expect.any(String), 'POST', '/api/v1/sync', JSON.stringify(payload));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up deadlines when enrollment fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(syncList('device-a', payload)).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds reading a stalled response body too', async () => {
    vi.mocked(getDeviceAuthSecret).mockReturnValue('secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const pending = expect(syncList('device-a', payload)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('signs OCR images and applies an OCR-specific deadline', async () => {
  vi.mocked(getDeviceAuthSecret).mockReturnValue('secret');
  const fetch = vi.fn().mockResolvedValue(response({ text: 'Pain' }));
  vi.stubGlobal('fetch', fetch);
  await expect(recognizeListPhoto('aW1hZ2U=')).resolves.toEqual({ text: 'Pain' });
  expect(signDeviceRequest).toHaveBeenLastCalledWith('secret', expect.any(Number), expect.any(String), 'POST', '/api/v1/ocr', JSON.stringify({ image_base64: 'aW1hZ2U=' }));
  await expect(recognizeListPhoto('A'.repeat(4 * 1024 * 1024))).rejects.toThrow('volumineuse');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockImplementation(() => new Promise(() => {}));
  const request = expect(recognizeListPhoto('aW1hZ2U=')).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30000);
  await request;
});

it('returns a local product without enrollment or network and caches successful lookup only', async () => {
  const product = { barcode: '3274080005003', product_name: 'Eau', categories: ['Boissons'], source: 'openfoodfacts', cached: false, stale: false, ttl_seconds: 60 };
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.mocked(ProductCache.get).mockReturnValue(product);
  await expect(getProduct(product.barcode)).resolves.toMatchObject({ cached: true, product_name: 'Eau' });
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(ProductCache.get).mockReturnValue(null);
  vi.mocked(getDeviceAuthSecret).mockReturnValue('secret');
  fetch.mockResolvedValueOnce(response(product));
  await getProduct(product.barcode);
  expect(ProductCache.set).toHaveBeenCalledWith('catalogues-v7:3274080005003', product);
  vi.mocked(ProductCache.set).mockClear();
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }));
  await expect(getProduct('3017620422003')).rejects.toThrow();
  expect(ProductCache.set).not.toHaveBeenCalled();
});

it('limits community suggestions to three without putting them in the product cache', async () => {
  vi.mocked(getDeviceAuthSecret).mockReturnValue('secret');
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    proposal_id: `proposal-${index}`, field: 'name', value: `Produit ${index}`, confirmations: index, agreement_ratio: 1,
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ barcode: '3017620422003', suggestions })));
  await expect(getCommunitySuggestions('3017620422003')).resolves.toMatchObject({ suggestions: suggestions.slice(0, 3) });
  expect(ProductCache.set).not.toHaveBeenCalled();
});

describe('community reports', () => {
  beforeEach(() => { vi.mocked(getDeviceAuthSecret).mockReturnValue('secret'); });
  it('signs only the target and reason, without changing cached products', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ recorded: true, publication_status: 'received' }));
    vi.stubGlobal('fetch', fetch);
    await expect(reportCommunityProposal('proposal-1', 'wrong_name')).resolves.toBeUndefined();
    expect(signDeviceRequest).toHaveBeenCalledWith('secret', expect.any(Number), expect.any(String), 'POST',
      '/api/v1/community/proposals/proposal-1/reports', JSON.stringify({ reason: 'wrong_name' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ProductCache.set).not.toHaveBeenCalled();
  });
  it.each([{}, { recorded: false }, null])('rejects an absent acknowledgment: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    await expect(reportCommunityProposal('proposal-1', 'spam')).rejects.toThrow('not acknowledged');
  });
  it.each([404, 429])('preserves HTTP status %s for actionable feedback', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(reportCommunityProposal('proposal-1', 'abuse')).rejects.toMatchObject({ status });
  });
  it('bounds a stalled report by eight seconds', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const pending = expect(reportCommunityProposal('proposal-1', 'wrong_product')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('reads current validated fields from the server without reusing or replacing product cache', async () => {
  vi.mocked(getDeviceAuthSecret).mockReturnValue('secret');
  const current = { barcode: '3017620422003', fields: [{ proposal_id: 'name-1', field: 'name', value: 'Nom public actuel' }], contributions_enabled: true };
  const fetch = vi.fn().mockResolvedValue(response(current));
  vi.stubGlobal('fetch', fetch);
  await expect(getValidatedCommunityFields(current.barcode)).resolves.toEqual(current);
  expect(signDeviceRequest).toHaveBeenCalledWith('secret', expect.any(Number), expect.any(String), 'GET',
    '/api/v1/community/products/3017620422003/validated', '');
  expect(ProductCache.get).not.toHaveBeenCalled();
  expect(ProductCache.set).not.toHaveBeenCalled();
});
