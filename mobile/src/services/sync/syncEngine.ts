import { fromSyncItemPayload, getProduct, syncList, toSyncItemPayload } from '../api/backend';
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

  async syncListIfOnline(listId: string, items: ShoppingItem[], lastSync: number) {
    const online = await this.isOnline();
    if (!online) {
      return { synced: false as const, reason: 'offline' as const };
    }

    if (!this.config) {
      return { synced: false as const, reason: 'missing_device_id_provider' as const };
    }

    const deviceId = await this.config.getDeviceId();
    const response = await syncList(deviceId, {
      list_id: listId,
      items: items.map(toSyncItemPayload),
      last_sync: lastSync,
    });

    return {
      synced: true as const,
      reason: 'ok' as const,
      response,
      remoteItems: response.updated_items.map(fromSyncItemPayload),
    };
  }
}
