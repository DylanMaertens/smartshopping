import { canConfigureTestServer, getTestServerUrl } from './testServer';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ProductCache } from '@/services/cache/sqliteProductCache';
import { createRequestId } from '@/services/api/requestId';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { getDeviceAuthSecret, signDeviceRequest, storeDeviceAuthSecret } from '@/services/identity/deviceAuth';
import type { ShoppingItem } from '@/types';

const API_BASE_URL = getApiBaseUrl();
const PRODUCT_LOOKUP_TIMEOUT_MS = 22000;
const SYNC_TIMEOUT_MS = 8000;
const enrollments = new Map<string, Promise<string>>();

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

export type CommunitySuggestion = {
  proposal_id: string;
  field: 'name' | 'category';
  value: string;
  confirmations: number;
  agreement_ratio: number;
};

export type CommunitySuggestions = {
  barcode: string;
  suggestions: CommunitySuggestion[];
  contributions_enabled?: boolean;
};

export type CommunityField = Pick<CommunitySuggestion, 'proposal_id' | 'field' | 'value'>;
export type ValidatedCommunityFields = { barcode: string; fields: CommunityField[]; contributions_enabled: boolean };

export async function getValidatedCommunityFields(barcode: string): Promise<ValidatedCommunityFields> {
  return requestJson<ValidatedCommunityFields>(
    `${API_BASE_URL}/community/products/${encodeURIComponent(barcode)}/validated`,
    8000, {}, 'Validated community fields error',
  );
}

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

export type SyncListName = { name: string; updated_at: number };

export type SyncPayload = {
  list_id: string;
  items: SyncItemPayload[];
  last_sync: number;
  list_name?: SyncListName;
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
  list_name?: SyncListName | null;
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
  const cacheKey = `catalogues-v7:${barcode}`;
  const cached = ProductCache.get<BackendProduct>(cacheKey);
  if (cached) return { ...cached, cached: true };

  const product = await requestJson<BackendProduct>(
    `${API_BASE_URL}/products/${barcode}`, PRODUCT_LOOKUP_TIMEOUT_MS, {}, 'Backend product lookup error',
  );
  ProductCache.set(cacheKey, product);
  return product;
}

export async function getCommunitySuggestions(barcode: string): Promise<CommunitySuggestions> {
  const result = await requestJson<CommunitySuggestions>(
    `${API_BASE_URL}/community/products/${encodeURIComponent(barcode)}/suggestions`,
    8000, {}, 'Community suggestions error',
  );
  return { ...result, suggestions: result.suggestions.slice(0, 3) };
}

export async function submitCommunityProposal(
  barcode: string, proposal: { name?: string; category?: string },
): Promise<{ proposal_ids: string[]; publication_status: string }> {
  return requestJson(`${API_BASE_URL}/community/products/${encodeURIComponent(barcode)}/proposals`, 8000, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal),
  }, 'Community proposal error');
}

export async function confirmCommunityProposal(proposalId: string, agrees = true): Promise<void> {
  await requestJson(`${API_BASE_URL}/community/proposals/${encodeURIComponent(proposalId)}/confirmations`, 8000, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agrees }),
  }, 'Community confirmation error');
}

export type CommunityReportReason = 'wrong_product' | 'wrong_name' | 'wrong_category' | 'abuse' | 'spam';

export async function reportCommunityProposal(proposalId: string, reason: CommunityReportReason): Promise<void> {
  const result = await requestJson<{ recorded: boolean }>(
    `${API_BASE_URL}/community/proposals/${encodeURIComponent(proposalId)}/reports`,
    8000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) },
    'Community report error',
  );
  if (result?.recorded !== true) throw new Error('Community report was not acknowledged');
}

export async function syncList(deviceId: string, payload: SyncPayload): Promise<SyncResponse> {
  return requestJson<SyncResponse>(`${API_BASE_URL}/sync`, SYNC_TIMEOUT_MS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify(payload),
  }, 'Backend sync error');
}

export async function createListInvitation(deviceId: string, listId: string): Promise<InvitationResponse> {
  return sharingRequest(`/lists/${encodeURIComponent(listId)}/invitations`, deviceId);
}

export async function joinListInvitation(deviceId: string, code: string): Promise<{ list_id: string }> {
  return sharingRequest(`/invitations/${encodeURIComponent(code.trim().toLowerCase())}/join`, deviceId);
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

export async function deleteSharedList(deviceId: string, listId: string): Promise<void> {
  await sharingRequest(`/lists/${encodeURIComponent(listId)}/delete`, deviceId);
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
  if (canConfigureTestServer()) return getTestServerUrl() ?? '';
  const releaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof releaseUrl === 'string' && releaseUrl) return releaseUrl;
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configuredUrl) return configuredUrl.trim().replace(/\/+$/, '');

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

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function requestJson<T>(
  url: string, timeoutMs: number, options: RequestInit, errorMessage: string,
): Promise<T> {
  if (!API_BASE_URL) throw new Error('Configure le serveur HTTPS dans Réglages → Serveur de test.');
  return withTimeout(async (signal) => {
    const headers = new Headers(options.headers);
    const requestId = createRequestId();
    headers.set('X-Request-Id', requestId);
    const deviceId = headers.get('X-Device-Id') ?? await getAnonymousDeviceId();
    headers.set('X-Device-Id', deviceId);
    const secret = await ensureDeviceEnrollment(deviceId);
    // A shared enrollment can outlive this caller's shorter deadline.
    if (signal.aborted) throw new Error('Request timed out');
    const timestamp = Date.now();
    const body = typeof options.body === 'string' ? options.body : '';
    const parsedUrl = new URL(url);
    headers.set('X-Device-Timestamp', String(timestamp));
    headers.set('X-Device-Signature', signDeviceRequest(
      secret, timestamp, requestId, options.method ?? 'GET', `${parsedUrl.pathname}${parsedUrl.search}`, body,
    ));
    const response = await fetch(url, { ...options, headers, signal });
    if (!response.ok) throw apiError(errorMessage, response);
    return response.json() as Promise<T>;
  }, timeoutMs);
}

async function ensureDeviceEnrollment(deviceId: string): Promise<string> {
  const existing = getDeviceAuthSecret(deviceId);
  if (existing) return existing;
  let enrollment = enrollments.get(deviceId);
  if (!enrollment) {
    enrollment = enrollDevice(deviceId).finally(() => { enrollments.delete(deviceId); });
    enrollments.set(deviceId, enrollment);
  }
  return enrollment;
}

async function enrollDevice(deviceId: string): Promise<string> {
  return withTimeout(async (signal) => {
    const response = await fetch(`${API_BASE_URL}/devices/register`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
      body: JSON.stringify({ device_id: deviceId }),
    });
    if (!response.ok) throw apiError('Device enrollment error', response);
    const payload = await response.json() as { device_id: string; secret: string };
    if (signal.aborted) throw new Error('Request timed out');
    if (payload.device_id !== deviceId) throw new Error('Device enrollment mismatch');
    storeDeviceAuthSecret(deviceId, payload.secret);
    return payload.secret;
  }, SYNC_TIMEOUT_MS);
}

export async function rotateDeviceSecret(deviceId: string): Promise<void> {
  const payload = await requestJson<{ device_id: string; secret: string }>(
    `${API_BASE_URL}/devices/rotate-secret`,
    SYNC_TIMEOUT_MS,
    { method: 'POST', headers: { 'X-Device-Id': deviceId } },
    'Device secret rotation error',
  );
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
  return requestJson<T>(`${API_BASE_URL}${path}`, SYNC_TIMEOUT_MS, {
    method,
    headers: { 'X-Device-Id': deviceId },
  }, 'Backend sharing error');
}

export async function recognizeListPhoto(imageBase64: string): Promise<{ text: string }> {
  if (!imageBase64 || imageBase64.length > 4 * 1024 * 1024 - 128) throw new Error('Photo trop volumineuse. Reprends la photo de plus près.');
  return requestJson<{ text: string }>(`${API_BASE_URL}/ocr`, 30000, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  }, 'OCR indisponible');
}
