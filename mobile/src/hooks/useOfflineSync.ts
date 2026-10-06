import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { SyncEngine } from '@/services/sync/syncEngine';

export function useOfflineSync() {
  const [networkState, setNetworkState] = useState<Network.NetworkState>({});
  const mounted = useRef(false);
  const networkVersion = useRef(0);
  const refreshNetwork = useCallback(async () => {
    const version = ++networkVersion.current;
    const state = await Network.getNetworkStateAsync();
    if (mounted.current && version === networkVersion.current) setNetworkState(state);
    return state;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const networkListener = Network.addNetworkStateListener((state) => {
      ++networkVersion.current;
      setNetworkState(state);
    });
    const appListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshNetwork().catch(() => {});
    });
    void refreshNetwork().catch(() => {});
    return () => {
      mounted.current = false;
      ++networkVersion.current;
      networkListener.remove();
      appListener.remove();
    };
  }, [refreshNetwork]);

  const syncEngine = useMemo(
    () => new SyncEngine(async () => {
      // Also update the displayed status when a sync discovers fresh connectivity.
      const state = await refreshNetwork();
      return state.isConnected === true && state.isInternetReachable !== false;
    }, { getDeviceId: getAnonymousDeviceId }),
    [refreshNetwork],
  );

  return { networkState, syncEngine };
}
