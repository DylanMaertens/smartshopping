import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'expo-crypto': fileURLToPath(new URL('./test/expoCryptoMock.ts', import.meta.url)),
      'expo-sqlite/kv-store': fileURLToPath(new URL('./test/expoSqliteKvMock.ts', import.meta.url)),
      'expo-secure-store': fileURLToPath(new URL('./test/expoSecureStoreMock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
