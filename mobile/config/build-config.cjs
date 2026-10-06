const CHANNELS = new Set(['development', 'preview', 'direct', 'store']);
const PROFILE_CHANNELS = {
  development: 'development',
  preview: 'preview',
  direct: 'direct',
  production: 'store',
};

function releaseApiUrl(value) {
  const message = 'Une compilation autonome nécessite EXPO_PUBLIC_API_BASE_URL : une URL HTTPS du serveur terminant par /api/v1, sans identifiants, paramètres ou fragment.';
  let url;
  try {
    url = new URL((value || '').trim());
  } catch {
    throw new Error(message);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' || url.username || url.password || url.href.includes('?') || url.href.includes('#') ||
    !url.pathname.replace(/\/+$/, '').endsWith('/api/v1') ||
    hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === '[::1]' || hostname === '0.0.0.0' || hostname.startsWith('127.') ||
    hostname === '10.0.2.2'
  ) {
    throw new Error(message);
  }
  return url.toString().replace(/\/+$/, '');
}

function createAppConfig(base, env = process.env, localApiUrl) {
  const profile = env.EAS_BUILD_PROFILE;
  const channel = env.SMARTSHOPPING_CHANNEL || PROFILE_CHANNELS[profile] || 'development';
  if (!CHANNELS.has(channel) || (profile && !PROFILE_CHANNELS[profile])) {
    throw new Error('Canal ou profil de compilation SmartShopping inconnu.');
  }
  if (profile && PROFILE_CHANNELS[profile] !== channel) {
    throw new Error('Le canal SmartShopping ne correspond pas au profil EAS.');
  }
  const testServerConfiguration = channel === 'preview' && env.SMARTSHOPPING_TEST_SERVER === 'true';
  const apiBaseUrl = channel === 'development'
    ? (localApiUrl ? releaseApiUrl(localApiUrl) : undefined)
    : (testServerConfiguration && !env.EXPO_PUBLIC_API_BASE_URL ? undefined : releaseApiUrl(env.EXPO_PUBLIC_API_BASE_URL));
  const projectId = env.EAS_PROJECT_ID?.trim() || base.extra?.eas?.projectId;
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EAS_PROJECT_ID doit être l’identifiant UUID du projet Expo.');
  }
  // Never copy process.env: only these public values belong in the application.
  const extra = { ...base.extra, distributionChannel: channel };
  delete extra.apiBaseUrl;
  delete extra.testServerConfiguration;
  if (testServerConfiguration) extra.testServerConfiguration = true;
  if (apiBaseUrl) extra.apiBaseUrl = apiBaseUrl;
  if (projectId) extra.eas = { ...extra.eas, projectId };
  return { ...base, extra };
}

module.exports = { createAppConfig };
