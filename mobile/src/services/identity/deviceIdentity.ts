import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';

type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array };

const DEVICE_ID_KEY = 'anonymous-device-id';

export async function getAnonymousDeviceId(): Promise<string> {
  const existing = LocalKeyValueStorage.getString(DEVICE_ID_KEY);
  if (existing && isUuidV4(existing)) return existing;

  const generated = generateUuidV4();
  LocalKeyValueStorage.setString(DEVICE_ID_KEY, generated);
  return generated;
}

export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function generateUuidV4(): string {
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoApi = (globalThis as { crypto?: CryptoLike }).crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}
