import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import * as SecureStore from 'expo-secure-store';

const SECRET_PREFIX = 'device-auth-secret:';

export function getDeviceAuthSecret(deviceId: string): string | null {
  return SecureStore.getItem(`${SECRET_PREFIX}${deviceId}`);
}

export function storeDeviceAuthSecret(deviceId: string, secret: string): void {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('Invalid device secret');
  SecureStore.setItem(`${SECRET_PREFIX}${deviceId}`, secret.toLowerCase());
}

export async function clearDeviceAuthSecret(deviceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${SECRET_PREFIX}${deviceId}`);
}

export function signDeviceRequest(
  secret: string,
  timestamp: number,
  requestId: string,
  method: string,
  target: string,
  body: string,
): string {
  const bodyHash = bytesToHex(sha256(utf8ToBytes(body)));
  const message = `${timestamp}\n${requestId}\n${method.toUpperCase()}\n${target}\n${bodyHash}`;
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(message)));
}
