import * as Crypto from 'expo-crypto';

export function createRequestId(): string {
  return Crypto.randomUUID();
}
