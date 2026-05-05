import { getProduct } from '../api/backend';

export type ConnectivityProbe = () => Promise<boolean>;

export class SyncEngine {
  constructor(private readonly isOnline: ConnectivityProbe) {}

  async performSyncIfOnline(barcodeProbe: string) {
    const online = await this.isOnline();
    if (!online) {
      return { synced: false as const, reason: 'offline' as const };
    }

    await getProduct(barcodeProbe);
    return { synced: true as const, reason: 'ok' as const };
  }
}
