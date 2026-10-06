import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const constants = vi.hoisted(() => ({
  expoConfig: { extra: {} as Record<string, unknown>, hostUri: '192.168.1.20:8081' },
}));
vi.mock('expo-constants', () => ({ default: constants }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/services/cache/sqliteProductCache', () => ({ ProductCache: { get: () => null, set: vi.fn() } }));
vi.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'device-a' }));
vi.mock('@/services/identity/deviceAuth', () => ({
  getDeviceAuthSecret: () => 'secret', storeDeviceAuthSecret: vi.fn(), signDeviceRequest: () => 'signature',
}));

beforeEach(() => {
  vi.resetModules();
  constants.expoConfig.extra = {};
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function requestedUrl() {
  const { syncList } = await import('./backend');
  await syncList('device-a', { list_id: 'list-a', items: [], last_sync: 0 });
  return vi.mocked(fetch).mock.calls[0][0];
}

it('uses the validated build address ahead of local environment and Metro', async () => {
  constants.expoConfig.extra.apiBaseUrl = 'https://api.example.org/api/v1';
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'http://localhost:3000/api/v1');
  expect(await requestedUrl()).toBe('https://api.example.org/api/v1/sync');
});

it('keeps the local Expo Go server discovery', async () => {
  expect(await requestedUrl()).toBe('http://192.168.1.20:3000/api/v1/sync');
});

it('cleans a manually configured development address', async () => {
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', ' http://192.168.1.30:3000/api/v1/// ');
  expect(await requestedUrl()).toBe('http://192.168.1.30:3000/api/v1/sync');
});


it('keeps an unconfigured standalone preview local without enrolling or sending anything', async () => {
  constants.expoConfig.extra = { distributionChannel: 'preview', testServerConfiguration: true };
  const { syncList, getConfiguredApiBaseUrl } = await import('./backend');
  expect(getConfiguredApiBaseUrl()).toBe('');
  await expect(syncList('device-a', { list_id: 'list-a', items: [], last_sync: 0 })).rejects.toThrow(/Configure le serveur/);
  expect(fetch).not.toHaveBeenCalled();
});
