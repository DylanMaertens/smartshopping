import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { getProduct } from '@/services/api/backend';
import { useOfflineSync } from './useOfflineSync';
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() }));
jest.mock('@/services/api/backend', () => ({ getProduct: jest.fn() }));
jest.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'device' }));
const online = { isConnected: true, isInternetReachable: true };
const offline = { isConnected: false, isInternetReachable: false };
let onAppChange: (state: AppStateStatus) => void;
let onNetworkChange: (state: Network.NetworkState) => void;
beforeEach(() => {
  jest.mocked(Network.getNetworkStateAsync).mockReset().mockResolvedValue(online);
  jest.mocked(Network.addNetworkStateListener).mockImplementation((callback) => {
    onNetworkChange = callback;
    return { remove: jest.fn() };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    onAppChange = callback;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());
it('refreshes stale offline state before syncing and updates the displayed status', async () => {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce(offline);
  const { result } = renderHook(useOfflineSync);
  await act(async () => {});
  expect(result.current.networkState).toEqual(offline);
  await act(async () => {
    expect(await result.current.syncEngine.performSyncIfOnline('12345678')).toMatchObject({ synced: true });
  });
  expect(getProduct).toHaveBeenCalledWith('12345678');
  expect(result.current.networkState).toEqual(online);
});
it('checks connectivity on return to the foreground without waiting for a network event', async () => {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce(offline);
  const { result } = renderHook(useOfflineSync);
  await act(async () => {});
  await act(async () => onAppChange('active'));
  expect(result.current.networkState).toEqual(online);
});
it('does not replace a newer network event with a delayed initial probe', async () => {
  let finish!: (state: Network.NetworkState) => void;
  jest.mocked(Network.getNetworkStateAsync).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(useOfflineSync);
  act(() => onNetworkChange(online));
  await act(async () => finish(offline));
  expect(result.current.networkState).toEqual(online);
});
it('does not contact the API while a fresh probe confirms offline', async () => {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue(offline);
  const { result } = renderHook(useOfflineSync);
  await act(async () => {
    expect(await result.current.syncEngine.performSyncIfOnline('12345678')).toMatchObject({ synced: false });
  });
  expect(getProduct).not.toHaveBeenCalled();
});
