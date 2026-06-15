import { Platform } from 'react-native';
import { ProductCache } from '@/services/cache/mmkvCache';

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

export type SyncPayload = {
  list_id: string;
  last_sync: number;
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

export async function syncList(deviceId: string, payload: SyncPayload) {
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

  return response.json();
}

function getApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  return 'http://127.0.0.1:3000/api/v1';
}
