import { useMemo } from 'react';
import { SyncEngine } from '@/services/sync/syncEngine';

export function useOfflineSync() {
  return useMemo(() => {
    const probe = async () => true;
    return new SyncEngine(probe);
  }, []);
}
