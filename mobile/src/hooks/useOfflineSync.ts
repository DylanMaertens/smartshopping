import { useMemo } from 'react';
import * as Network from 'expo-network';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { SyncEngine } from '@/services/sync/syncEngine';

export function useOfflineSync() {
  const networkState = Network.useNetworkState();
  const syncEngine = useMemo(
    () =>
      new SyncEngine(async () => {
        const currentState = await Network.getNetworkStateAsync();
        return currentState.isConnected === true && currentState.isInternetReachable !== false;
      }, { getDeviceId: getAnonymousDeviceId }),
    [],
  );

  return { networkState, syncEngine };
}
