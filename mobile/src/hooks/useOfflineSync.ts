import { useMemo } from 'react';
import { SyncEngine } from '@/services/sync/syncEngine';

async function getAnonymousDeviceId() {
  // TODO: persist this value in secure/local storage during the device identity task.
  return '00000000-0000-4000-8000-000000000000';
}

export function useOfflineSync() {
  return useMemo(() => {
    const probe = async () => true;
    return new SyncEngine(probe, { getDeviceId: getAnonymousDeviceId });
  }, []);
}
