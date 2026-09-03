import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ProductCache } from '@/services/cache/sqliteProductCache';
import { createRequestId } from '@/services/api/requestId';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { getDeviceAuthSecret, signDeviceRequest, storeDeviceAuthSecret } from '@/services/identity/deviceAuth';
import type { ShoppingItem } from '@/types';

const API_BASE_URL = getApiBaseUrl();
const PRODUCT_LOOKUP_TIMEOUT_MS = 3500;
const SYNC_TIMEOUT_MS = 8000;
let enrollmentPromise: Promise<string> | null = null;

export type InvitationResponse = { code: string; list_id: string; expires_at: number };

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
  device_id: string;
  server_time: number;
  conflicts: Array<{
    entity_id: string;
    local_updated_at: number;
    remote_updated_at: number;
    resolution: string;
  }>;
  updated_items: SyncItemPayload[];
};

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

export async function getProduct(barcode: string): Promise<BackendProduct> {
  const cached = ProductCache.get<BackendProduct>(barcode);
  if (cached) return { ...cached, cached: true };

  const response = await fetchWithTimeout(`${API_BASE_URL}/products/${barcode}`, PRODUCT_LOOKUP_TIMEOUT_MS);
  if (!response.ok) {
    throw apiError('Backend product lookup error', response);
  }

  const product = (await response.json()) as BackendProduct;
  ProductCache.set(barcode, product);
  return product;
}

export async function syncList(deviceId: string, payload: SyncPayload): Promise<SyncResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sync`, SYNC_TIMEOUT_MS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw apiError('Backend sync error', response);
  }

  return response.json() as Promise<SyncResponse>;
}

export async function createListInvitation(deviceId: string, listId: string): Promise<InvitationResponse> {
  return sharingRequest(`/lists/${encodeURIComponent(listId)}/invitations`, deviceId);
}

export async function joinListInvitation(deviceId: string, code: string): Promise<{ list_id: string }> {
  return sharingRequest(`/invitations/${encodeURIComponent(code.trim())}/join`, deviceId);
}

export async function revokeListInvitation(deviceId: string, code: string): Promise<{ revoked: boolean }> {
  return sharingRequest(`/invitations/${encodeURIComponent(code)}/revoke`, deviceId);
}

export type SharedListMember = { device_id: string; role: string; joined_at: number };

export async function getListMembers(deviceId: string, listId: string): Promise<SharedListMember[]> {
  const response = await sharingRequest<{ members: SharedListMember[] }>(
    `/lists/${encodeURIComponent(listId)}/members`, deviceId, 'GET',
  );
  return response.members;
}

export async function removeListMember(deviceId: string, listId: string, memberId: string): Promise<void> {
  await sharingRequest(
    `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(memberId)}/revoke`, deviceId,
  );
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

export function getConfiguredApiBaseUrl(): string {
  return API_BASE_URL;
}

function getApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const metroHost = getMetroHost();
  if (metroHost) return `http://${metroHost}:3000/api/v1`;

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  return 'http://127.0.0.1:3000/api/v1';
}

function getMetroHost(): string | null {
  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
  };
  const hostUri = constants.expoConfig?.hostUri ?? constants.manifest?.debuggerHost;
  return hostUri?.split(':')[0] ?? null;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(options.headers);
  const requestId = createRequestId();
  headers.set('X-Request-Id', requestId);
  const deviceId = headers.get('X-Device-Id') ?? await getAnonymousDeviceId();
  if (!headers.has('X-Device-Id')) {
    headers.set('X-Device-Id', deviceId);
  }
  const secret = await ensureDeviceEnrollment(deviceId);
  const timestamp = Date.now();
  const body = typeof options.body === 'string' ? options.body : '';
  const parsedUrl = new URL(url);
  headers.set('X-Device-Timestamp', String(timestamp));
  headers.set('X-Device-Signature', signDeviceRequest(
    secret, timestamp, requestId, options.method ?? 'GET', `${parsedUrl.pathname}${parsedUrl.search}`, body,
  ));

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureDeviceEnrollment(deviceId: string): Promise<string> {
  const existing = getDeviceAuthSecret(deviceId);
  if (existing) return existing;
  enrollmentPromise ??= enrollDevice(deviceId).finally(() => { enrollmentPromise = null; });
  return enrollmentPromise;
}

async function enrollDevice(deviceId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/devices/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!response.ok) throw apiError('Device enrollment error', response);
  const payload = await response.json() as { device_id: string; secret: string };
  if (payload.device_id !== deviceId) throw new Error('Device enrollment mismatch');
  storeDeviceAuthSecret(deviceId, payload.secret);
  return payload.secret;
}

export async function rotateDeviceSecret(deviceId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/devices/rotate-secret`,
    SYNC_TIMEOUT_MS,
    { method: 'POST', headers: { 'X-Device-Id': deviceId } },
  );
  if (!response.ok) throw apiError('Device secret rotation error', response);
  const payload = await response.json() as { device_id: string; secret: string };
  if (payload.device_id !== deviceId) throw new Error('Device rotation mismatch');
  storeDeviceAuthSecret(deviceId, payload.secret);
}

function apiError(message: string, response: Response): BackendApiError {
  return new BackendApiError(
    `${message}: ${response.status}`,
    response.status,
    response.headers.get('x-request-id') ?? 'non-disponible',
  );
}

async function sharingRequest<T>(path: string, deviceId: string, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, SYNC_TIMEOUT_MS, {
    method,
    headers: { 'X-Device-Id': deviceId },
  });
  if (!response.ok) throw apiError('Backend sharing error', response);
  return response.json() as Promise<T>;
}
