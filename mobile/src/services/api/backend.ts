import { Platform } from 'react-native';
import { ProductCache } from '@/services/cache/mmkvCache';
import type { ShoppingItem } from '@/types';

const API_BASE_URL = getApiBaseUrl();

export type BackendProduct = {
  barcode: string;
  product_name: string;
  categories: string[];
  image_url?: string | null;
  cached: boolean;
  stale: boolean;
  source: string;
  ttl_seconds: number;
};

export type SyncItemPayload = {
  id: string;
  list_id: string;
  name: string;
  barcode?: string;
  category?: string;
  quantity: number;
  checked: boolean;
  updated_at: number;
  deleted_at?: number;
};

export type SyncPayload = {
  list_id: string;
  items: SyncItemPayload[];
  last_sync: number;
};

export type SyncResponse = {
  list_id: string;
  server_time: number;
  conflicts: Array<{
    entity_id: string;
    local_updated_at: number;
    remote_updated_at: number;
    resolution: string;
  }>;
  updated_items: SyncItemPayload[];
};

export async function getProduct(barcode: string): Promise<BackendProduct> {
  const cached = ProductCache.get<BackendProduct>(barcode);
  if (cached) return { ...cached, cached: true };

  const response = await fetch(`${API_BASE_URL}/products/${barcode}`);
  if (!response.ok) {
    throw new Error(`Backend product lookup error: ${response.status}`);
  }

  const product = (await response.json()) as BackendProduct;
  ProductCache.set(barcode, product);
  return product;
}

export async function syncList(deviceId: string, payload: SyncPayload): Promise<SyncResponse> {
  const response = await fetch(`${API_BASE_URL}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Backend sync error: ${response.status}`);
  }

  return response.json() as Promise<SyncResponse>;
}

export function toSyncItemPayload(item: ShoppingItem): SyncItemPayload {
  return {
    id: item.id,
    list_id: item.listId,
    name: item.name,
    barcode: item.barcode,
    category: item.category,
    quantity: item.quantity,
    checked: item.checked,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt,
  };
}

export function fromSyncItemPayload(item: SyncItemPayload): ShoppingItem {
  return {
    id: item.id,
    listId: item.list_id,
    name: item.name,
    barcode: item.barcode,
    category: item.category,
    quantity: item.quantity,
    checked: item.checked,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at,
    syncedAt: Date.now(),
  };
}

function getApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  return 'http://127.0.0.1:3000/api/v1';
}
