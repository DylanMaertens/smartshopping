const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAppConfig } = require('./build-config.cjs');
const base = require('../app.json').expo;
const profiles = require('../eas.json').build;
const apiUrl = 'https://api.example.org/api/v1';

test('Expo Go still starts without a hosted API or Expo account', () => {
  const result = createAppConfig(base, {});
  assert.equal(result.extra.distributionChannel, 'development');
  assert.equal(result.extra.apiBaseUrl, undefined);
  assert.equal(result.extra.eas, undefined);
});

for (const profile of ['preview', 'direct', 'production']) {
  test(`${profile} refuses an autonomous build without an API`, () => {
    assert.throws(() => createAppConfig(base, { EAS_BUILD_PROFILE: profile }), /EXPO_PUBLIC_API_BASE_URL/);
  });
}

for (const value of [
  'http://api.example.org/api/v1',
  'https://localhost/api/v1',
  'https://127.0.0.1/api/v1',
  'https://[::1]/api/v1',
  'https://10.0.2.2/api/v1',
  'https://user:password@api.example.org/api/v1',
  'https://api.example.org/api/v1?token=private',
  'https://api.example.org/api/v1#fragment',
  'https://api.example.org/api/v1?',
  'https://api.example.org/api/v1#',
  'https://api.example.org',
  '/api/v1',
]) {
  test(`rejects unsuitable release API: ${value}`, () => {
    assert.throws(() => createAppConfig(base, {
      SMARTSHOPPING_CHANNEL: 'direct', EXPO_PUBLIC_API_BASE_URL: value,
    }), /EXPO_PUBLIC_API_BASE_URL/);
  });
}

test('all standalone profiles preserve app identity and use the expected artifact', () => {
  for (const name of ['preview', 'direct', 'production']) {
    const profile = profiles[name];
    const inherited = profile.extends ? profiles[profile.extends] : {};
    const resolved = { ...inherited, ...profile, env: { ...inherited.env, ...profile.env } };
    const config = createAppConfig(base, {
      ...resolved.env, EAS_BUILD_PROFILE: name, EXPO_PUBLIC_API_BASE_URL: ` ${apiUrl}/// `,
    });
    assert.equal(config.extra.apiBaseUrl, apiUrl);
    assert.equal(config.android.package, base.android.package);
    assert.equal(config.ios.bundleIdentifier, base.ios.bundleIdentifier);
    assert.equal(resolved.developmentClient, false);
    assert.equal(resolved.android.buildType, name === 'production' ? 'app-bundle' : 'apk');
    assert.equal(resolved.environment, name === 'preview' ? 'preview' : 'production');
  }
});

test('a typo or inconsistent channel cannot bypass release validation', () => {
  for (const env of [
    { SMARTSHOPPING_CHANNEL: 'prodution' },
    { EAS_BUILD_PROFILE: 'new-profile' },
    { EAS_BUILD_PROFILE: 'production', SMARTSHOPPING_CHANNEL: 'development' },
  ]) assert.throws(() => createAppConfig(base, env), /Canal|canal/);
});

test('preserves an initialized Expo project and does not expose arbitrary environment variables', () => {
  const projectId = '11111111-2222-4333-8444-555555555555';
  const configuredBase = { ...base, extra: { eas: { projectId }, existing: true } };
  const config = createAppConfig(configuredBase, { PAYMENT_SECRET: 'never-in-app' });
  assert.equal(config.extra.eas.projectId, projectId);
  assert.equal(config.extra.existing, true);
  assert.equal(JSON.stringify(config).includes('never-in-app'), false);
  assert.equal(createAppConfig(base, { EAS_PROJECT_ID: projectId }).extra.eas.projectId, projectId);
  assert.throws(() => createAppConfig(base, { EAS_PROJECT_ID: 'not-a-project-id' }), /UUID/);
});

test('temporary HTTPS API overrides the old LAN address only in development', () => {
  const tunnel = 'https://demo.trycloudflare.com/api/v1';
  const development = createAppConfig(base, { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.2:3000/api/v1' }, tunnel);
  assert.equal(development.extra.apiBaseUrl, tunnel);
  const production = createAppConfig(base, { SMARTSHOPPING_CHANNEL: 'direct', EXPO_PUBLIC_API_BASE_URL: apiUrl }, tunnel);
  assert.equal(production.extra.apiBaseUrl, apiUrl);
  assert.throws(() => createAppConfig(base, { SMARTSHOPPING_CHANNEL: 'direct' }, tunnel), /EXPO_PUBLIC_API_BASE_URL/);
  assert.throws(() => createAppConfig(base, {}, 'http://demo.trycloudflare.com/api/v1'), /HTTPS/);
});

test('only an explicitly configurable preview may start without an embedded API', () => {
  const extra = createAppConfig(base, { SMARTSHOPPING_CHANNEL: 'preview', SMARTSHOPPING_TEST_SERVER: 'true' }).extra;
  assert.equal(extra.testServerConfiguration, true);
  assert.equal(extra.apiBaseUrl, undefined);
  for (const channel of ['direct', 'store']) {
    assert.throws(() => createAppConfig(base, { SMARTSHOPPING_CHANNEL: channel, SMARTSHOPPING_TEST_SERVER: 'true' }), /EXPO_PUBLIC_API_BASE_URL/);
    assert.equal(createAppConfig(base, { SMARTSHOPPING_CHANNEL: channel, SMARTSHOPPING_TEST_SERVER: 'true', EXPO_PUBLIC_API_BASE_URL: apiUrl }).extra.testServerConfiguration, undefined);
  }
});
