import { fromSyncItemPayload, getProduct, syncList, toSyncItemPayload, type SyncItemPayload, type SyncListName, type SyncResponse } from '../api/backend';
import type { ShoppingItem } from '@/types';

export type ConnectivityProbe = () => Promise<boolean>;

export type SyncEngineConfig = {
  getDeviceId: () => Promise<string>;
};

export class SyncEngine {
  constructor(
    private readonly isOnline: ConnectivityProbe,
    private readonly config?: SyncEngineConfig,
  ) {}

  async performSyncIfOnline(barcodeProbe: string) {
    const online = await this.isOnline();
    if (!online) {
      return { synced: false as const, reason: 'offline' as const };
    }

    await getProduct(barcodeProbe);
    return { synced: true as const, reason: 'ok' as const };
  }

  async syncListIfOnline(listId: string, items: ShoppingItem[], lastSync: number, listName?: SyncListName) {
    const online = await this.isOnline();
    if (!online) {
      return { synced: false as const, reason: 'offline' as const };
    }

    if (!this.config) {
      return { synced: false as const, reason: 'missing_device_id_provider' as const };
    }

    const deviceId = await this.config.getDeviceId();
    // Keep the original snapshot pending until every batch succeeds. Retrying
    // an accepted batch is safe under LWW; a partial failure must not lose edits.
    let response: SyncResponse | undefined;
    for (const batch of splitSyncBatches(listId, items.map(toSyncItemPayload), lastSync, listName)) {
      response = await syncList(deviceId, { list_id: listId, items: batch, last_sync: lastSync, ...(listName ? { list_name: listName } : {}) });
      if (response.list_id !== listId || response.device_id !== deviceId) {
        throw new Error('Sync response identity mismatch');
      }
    }
    if (!response) throw new Error('Missing sync response');

    return {
      synced: true as const,
      reason: 'ok' as const,
      response,
      remoteItems: response.updated_items.map(fromSyncItemPayload),
    };
  }
}

// Leave room below the server's 64 KiB body limit, including JSON escaping.
export const SYNC_BATCH_BYTES = 48 * 1024;
export function splitSyncBatches(listId: string, items: SyncItemPayload[], lastSync: number, listName?: SyncListName): SyncItemPayload[][] {
  const batches: SyncItemPayload[][] = [];
  let batch: SyncItemPayload[] = [];
  const size = (entries: SyncItemPayload[]) => {
    const json = JSON.stringify({ list_id: listId, items: entries, last_sync: lastSync, ...(listName ? { list_name: listName } : {}) });
    let bytes = 0;
    for (const char of json) {
      const point = char.codePointAt(0)!;
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return bytes;
  };
  for (const item of items) {
    if (size([...batch, item]) > SYNC_BATCH_BYTES) {
      if (batch.length === 0 || size([item]) > SYNC_BATCH_BYTES) throw new Error('Item exceeds sync request limit');
      batches.push(batch);
      batch = [];
    }
    batch.push(item);
  }
  if (batch.length || !batches.length) batches.push(batch);
  return batches;
}
