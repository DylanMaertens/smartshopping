const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rn = createRequire(require.resolve('react-native/package.json'));
const cliPlugin = createRequire(rn.resolve('@react-native/community-cli-plugin/package.json'));
const cli = createRequire(cliPlugin.resolve('@react-native-community/cli/package.json'));
const android = createRequire(cli.resolve('@react-native-community/cli-platform-android/package.json'));
const ios = createRequire(cli.resolve('@react-native-community/cli-platform-ios/package.json'));

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poduna-security-tools-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('patched XML parser preserves Android launcher detection through the real CLI', (t) => {
  const manifest = path.join(fixture(t), 'AndroidManifest.xml');
  fs.writeFileSync(manifest, `<?xml version="1.0"?>
    <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.smartshopping.app">
      <application android:label="Poduna &amp; Courses">
        <activity android:name=".OtherActivity" />
        <activity android:name=".MainActivity"><intent-filter>
          <action android:name="android.intent.action.MAIN" />
          <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter></activity>
      </application>
    </manifest>`);
  const getMainActivity = android('./build/config/getMainActivity.js').default;
  assert.equal(getMainActivity(manifest), '.MainActivity');
  const { XMLParser, XMLValidator } = android('fast-xml-parser');
  assert.equal(XMLValidator.validate(fs.readFileSync(manifest, 'utf8')), true);
  assert.equal(new XMLParser({ ignoreAttributes: false }).parse(fs.readFileSync(manifest, 'utf8'))
    .manifest.application['@_android:label'], 'Poduna & Courses');
});

test('patched XML parser preserves Xcode scheme configuration through the real CLI', (t) => {
  const root = fixture(t);
  const schemes = path.join(root, 'Poduna.xcodeproj', 'xcshareddata', 'xcschemes');
  fs.mkdirSync(schemes, { recursive: true });
  fs.writeFileSync(path.join(schemes, 'Poduna.xcscheme'), '<?xml version="1.0"?><Scheme version="1.3"><LaunchAction buildConfiguration="Release" /></Scheme>');
  const { getBuildConfigurationFromXcScheme } = ios('./build/tools/getBuildConfigurationFromXcScheme.js');
  assert.equal(getBuildConfigurationFromXcScheme('Poduna', 'Debug', root, { schemes: ['Poduna'] }), 'Release');
});

test('patched UUID keeps Xcode IDs compatible and rejects undersized v5 output buffers', () => {
  const expo = createRequire(require.resolve('expo/package.json'));
  const plugins = createRequire(expo.resolve('@expo/config-plugins/package.json'));
  const xcode = plugins('xcode');
  const project = xcode.project('in-memory.pbxproj');
  project.hash = { project: { objects: {} } };
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9A-F]{24}$/);
  const { v5 } = createRequire(plugins.resolve('xcode'))('uuid');
  assert.throws(() => v5('Poduna', v5.DNS, new Uint8Array(8)), RangeError);
});

test('bundle audit fails on embedded packages, empty maps and failed audits', (t) => {
  const root = fixture(t), auditPath = path.join(root, 'audit.json'), mapPath = path.join(root, 'app.map');
  const run = (audit, map) => {
    fs.writeFileSync(auditPath, JSON.stringify(audit));
    fs.writeFileSync(mapPath, JSON.stringify(map));
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../ops/check-mobile-bundle-audit.mjs'), auditPath, mapPath], { encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  };
  const audit = { metadata: { vulnerabilities: { high: 1 } }, advisories: { one: { module_name: '@scope/example' } } };
  assert.equal(run(audit, { sources: ['/src/App.tsx'] }).status, 0);
  const present = run(audit, { sections: [{ map: { sources: ['/src/App.tsx', 'C:\\node_modules\\@scope\\example\\index.js'] } }] });
  assert.equal(present.status, 1);
  assert.ok(present.stdout, present.stderr);
  assert.equal(JSON.parse(present.stdout).packages[0].sources.length, 1);
  assert.equal(run(audit, { sources: [] }).status, 1);
  assert.equal(run({ error: { message: 'Network failed' } }, { sources: ['/src/App.tsx'] }).status, 1);
  assert.equal(run({ metadata: audit.metadata, advisories: {} }, { sources: ['/src/App.tsx'] }).status, 1);
});
