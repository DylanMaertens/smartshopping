import { useMemo } from 'react';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { SyncEngine } from '@/services/sync/syncEngine';

export function useOfflineSync() {
  return useMemo(() => {
    const probe = async () => true;
    return new SyncEngine(probe, { getDeviceId: getAnonymousDeviceId });
  }, []);
}
