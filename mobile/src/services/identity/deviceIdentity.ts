import * as Crypto from 'expo-crypto';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { clearDeviceAuthSecret } from '@/services/identity/deviceAuth';

const DEVICE_ID_KEY = 'anonymous-device-id';

export async function getAnonymousDeviceId(): Promise<string> {
  const existing = LocalKeyValueStorage.getString(DEVICE_ID_KEY);
  if (existing && isUuidV4(existing)) return existing;

  const generated = Crypto.randomUUID();
  LocalKeyValueStorage.setString(DEVICE_ID_KEY, generated);
  return generated;
}

export async function rotateAnonymousDeviceId(): Promise<string> {
  const current = LocalKeyValueStorage.getString(DEVICE_ID_KEY);
  if (current) await clearDeviceAuthSecret(current);
  const generated = Crypto.randomUUID();
  LocalKeyValueStorage.setString(DEVICE_ID_KEY, generated);
  return generated;
}

export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
