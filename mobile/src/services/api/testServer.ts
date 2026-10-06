import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const KEY = 'smartshopping-test-api-url';
export function canConfigureTestServer(): boolean {
  return Constants.expoConfig?.extra?.distributionChannel === 'preview'
    && Constants.expoConfig?.extra?.testServerConfiguration === true;
}
export function normalizeTestServerUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Indique une adresse HTTPS valide.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || value.includes('?') || value.includes('#') || url.port
    || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || url.hostname.endsWith('.localhost')) {
    throw new Error('Utilise une adresse HTTPS publique, sans identifiants ni paramètres.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '' && path !== '/api/v1') throw new Error('Colle l’adresse du serveur ou de son API /api/v1.');
  return `${url.origin}/api/v1`;
}
export function getTestServerUrl(): string | null {
  if (!canConfigureTestServer()) return null;
  const value = SecureStore.getItem(KEY);
  if (!value) return null;
  try { return normalizeTestServerUrl(value); } catch { return null; }
}
export async function verifyAndSaveTestServer(value: string): Promise<string> {
  if (!canConfigureTestServer()) throw new Error('Ce réglage est réservé à l’APK de test.');
  const url = normalizeTestServerUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // No device identity, secret or list content is sent by this connectivity test.
    const response = await fetch(`${url.slice(0, -7)}/health`, { signal: controller.signal, redirect: 'error' });
    if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Serveur indisponible.');
    SecureStore.setItem(KEY, url);
    return url;
  } catch {
    throw new Error('Serveur inaccessible. Vérifie l’adresse et que le serveur HTTPS est démarré sur le PC.');
  } finally { clearTimeout(timer); }
}
