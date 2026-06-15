const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

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
  const response = await fetch(`${API_BASE_URL}/products/${barcode}`);
  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }
  return response.json();
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
