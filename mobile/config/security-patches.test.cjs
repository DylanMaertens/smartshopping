const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { generateKeyPairSync } = require('node:crypto');

const expo = createRequire(require.resolve('expo/package.json'));
const expoCli = createRequire(expo.resolve('@expo/cli/package.json'));
const signing = createRequire(expoCli.resolve('@expo/code-signing-certificates/package.json'));
const forge = signing('node-forge');
const rn = createRequire(require.resolve('react-native/package.json'));
const rnPlugin = createRequire(rn.resolve('@react-native/community-cli-plugin/package.json'));
const cli = createRequire(rnPlugin.resolve('@react-native-community/cli/package.json'));
const hermes = createRequire(cli.resolve('@react-native-community/cli-hermes/package.json'));
const ip = hermes('ip');
const metroConfig = createRequire(expo.resolve('@expo/metro-config/package.json'));
const metro = createRequire(metroConfig.resolve('metro/package.json'));
const fileMap = createRequire(metro.resolve('metro-file-map/package.json'));
const micromatch = fileMap('micromatch');
const braces = createRequire(fileMap.resolve('micromatch'))('braces');
const preset = createRequire(require.resolve('@react-native/jest-preset/package.json'));
const babelJest = createRequire(preset.resolve('babel-jest/package.json'));
const instrumentation = createRequire(babelJest.resolve('babel-plugin-istanbul/package.json'));
const istanbul = createRequire(instrumentation.resolve('@istanbuljs/load-nyc-config/package.json'));
const yaml = createRequire(istanbul.resolve('js-yaml/package.json'));
const argparse = yaml('argparse');
const sprintf = createRequire(yaml.resolve('argparse'))('sprintf-js').sprintf;

test('IP classification rejects advisory bypass spellings and invalid addresses', () => {
  for (const address of [
    '127.1', '127.0.0.1', '0177.0.0.1', '2130706433', '0x7f000001',
    '01200034567', '012.1.2.3', '000:0:0000::01', '::fFFf:127.0.0.1',
    '0:0:0:0:0:ffff:7f00:1', '::7f00:1', '::ffff:10.0.0.1',
    '::', '0.0.0.0', '10.0.0.1', '172.16.0.1', '172.31.255.255',
    '192.168.2.1', '169.254.169.254', '100.64.0.1', '100.127.255.255',
    'fc00::1', 'fd12::1', 'fe90::1234', 'ff02::1', '2001:db8::1',
    '2002:7f00:1::', '64:ff9b::7f00:1', '192.0.2.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '', 'example.org', '999.1.1.1', '4294967296', '1.2.3.4/path',
    '1.2.3.4@127.0.0.1', '127.0.0.1.invalid', '1.2.3.4:80', ' 8.8.8.8',
    'fe80::1%eth0', null, undefined, 2130706433,
  ]) {
    assert.equal(ip.isPublic(address), false, String(address));
    assert.equal(ip.isPrivate(address), true, String(address));
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '172.15.1.1', '172.32.1.1',
    '100.63.255.255', '100.128.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888',
    '::ffff:8.8.8.8', '0:0:0:0:0:ffff:808:808']) {
    assert.equal(ip.isPublic(address), true, address);
  }
  for (const address of ['127.1', '::1', '000:0:0000::01', '::fFFf:127.0.0.1']) {
    assert.equal(ip.isLoopback(address), true, address);
  }
  assert.equal(ip.isLoopback('127.0.0.1.invalid'), false);
});

test('Hermes IP utility still selects an interface and supports subnet operations', (t) => {
  t.mock.method(require('node:os'), 'networkInterfaces', () => ({
    lo: [{ family: 'IPv4', address: '127.0.0.1' }],
    wlan0: [{ family: 'IPv4', address: '192.168.1.10' }],
  }));
  assert.equal(ip.address(), '192.168.1.10');
  assert.equal(ip.address('wlan0', 'ipv4'), '192.168.1.10');
  assert.equal(ip.cidrSubnet('192.168.1.0/24').contains('192.168.1.10'), true);
});

test('braces rejects deeply nested strings before exhausting the stack', () => {
  for (const pattern of ['{'.repeat(4000) + 'x' + '}'.repeat(4000),
    '('.repeat(4000) + 'x' + ')'.repeat(4000), '{('.repeat(2000) + 'x' + ')}'.repeat(2000)]) {
    for (const operation of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(pattern), { name: 'SyntaxError', message: /nesting/ });
    }
  }
  assert.doesNotThrow(() => braces.compile('{'.repeat(100) + 'x' + '}'.repeat(100)));
  assert.throws(() => braces.compile('{'.repeat(101) + 'x' + '}'.repeat(101)), /nesting/);
  assert.doesNotThrow(() => braces.compile('\\{'.repeat(500) + 'x' + '\\}'.repeat(500)));
  assert.doesNotThrow(() => braces.compile('"' + '{'.repeat(500) + '"'));
});

test('braces protects direct AST walkers as well as string parsing', () => {
  const ast = { type: 'root', nodes: [] };
  let node = ast;
  for (let i = 0; i < 4000; i++) {
    const child = { type: 'brace', nodes: [], parent: node, commas: 1 };
    node.nodes.push(child);
    node = child;
  }
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(ast), { name: 'SyntaxError', message: /nesting/ });
  }
});

test('Metro glob matching and brace ranges retain their normal results', () => {
  assert.deepEqual(braces.expand('src/{screens,services}/{a,b}.tsx'), [
    'src/screens/a.tsx', 'src/screens/b.tsx', 'src/services/a.tsx', 'src/services/b.tsx',
  ]);
  assert.deepEqual(braces.expand('image-{01..03}.png'), ['image-01.png', 'image-02.png', 'image-03.png']);
  assert.deepEqual(micromatch(['src/App.tsx', 'src/a.ts', 'docs/a.md'], 'src/**/*.{ts,tsx}'), ['src/App.tsx', 'src/a.ts']);
});

test('sprintf numeric precision is bounded without an uncaught RangeError', () => {
  for (const type of ['f', 'e', 'g']) {
    for (const precision of ['101', '1000000', '9'.repeat(400)]) {
      const result = sprintf('%.' + precision + type, 1.25);
      assert.equal(result, sprintf('%.100' + type, 1.25));
      assert.ok(result.length < 120);
    }
  }
  assert.equal(sprintf('%.0g', 1.25), '1');
  assert.equal(sprintf('%.0f', 1.25), '1');
  assert.equal(sprintf('%.2f', 1.25), '1.25');
  assert.equal(sprintf('%.200s', 'a'.repeat(180)).length, 180); // string precision unchanged
  assert.equal(sprintf('%04d %s', 7, 'Poduna'), '0007 Poduna');
});

test('argparse help and CLI arguments still work with patched sprintf', () => {
  const parser = new argparse.ArgumentParser({ prog: 'poduna', addHelp: true });
  parser.addArgument('--port', { type: 'int', defaultValue: 8057, help: 'port %(defaultValue)s' });
  assert.match(parser.formatHelp(), /8057/);
  assert.equal(parser.parseArgs(['--port', '8080']).port, 8080);
  assert.equal(createRequire(yaml.resolve('argparse'))('./package.json').version, '1.0.10');
});

// Ephemeral keys generated for tests only: never read project signing material.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 3,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const privateKey = forge.pki.privateKeyFromPem(pair.privateKey);
const publicKey = forge.pki.publicKeyFromPem(pair.publicKey);
const digest = forge.md.sha256.create().update('Poduna regression fixture').digest().getBytes();
const asn = forge.asn1;
const leaf = (type, value) => asn.create(asn.Class.UNIVERSAL, type, false, value);
const sequence = value => asn.create(asn.Class.UNIVERSAL, asn.Type.SEQUENCE, true, value);
function signDigestInfo(parameters, extra = []) {
  const info = sequence([
    sequence([leaf(asn.Type.OID, asn.oidToDer(forge.oids.sha256).getBytes()), ...parameters]),
    leaf(asn.Type.OCTETSTRING, digest), ...extra,
  ]);
  return privateKey.sign(asn.toDer(info).getBytes(), 'NONE');
}

test('forge rejects surplus nested DigestAlgorithm children and malformed NULLs', () => {
  const nullNode = () => leaf(asn.Type.NULL, '');
  const garbage = () => leaf(asn.Type.OCTETSTRING, 'untrusted padding');
  for (const parameters of [[nullNode(), garbage()], [garbage()], [nullNode(), nullNode()],
    [leaf(asn.Type.NULL, 'not empty')], [sequence([nullNode()])]]) {
    assert.throws(() => publicKey.verify(digest, signDigestInfo(parameters)), /DigestInfo/);
  }
  assert.throws(() => publicKey.verify(digest, signDigestInfo([nullNode()], [garbage()])), /DigestInfo/);
});

test('forge accepts standard signatures, optional SHA NULL and rejects a wrong digest', () => {
  for (const parameters of [[], [leaf(asn.Type.NULL, '')]]) {
    const signature = signDigestInfo(parameters);
    assert.equal(publicKey.verify(digest, signature), true);
    assert.equal(publicKey.verify('x'.repeat(32), signature), false);
  }
  for (const algorithm of ['sha1', 'sha256', 'sha384', 'sha512']) {
    const md = forge.md[algorithm].create().update('Poduna');
    assert.equal(publicKey.verify(md.digest().getBytes(), privateKey.sign(md)), true);
  }
});

test('Expo code-signing certificate generation and validation remain compatible', () => {
  const certificates = expoCli('@expo/code-signing-certificates');
  const keyPair = { privateKey, publicKey };
  const certificate = certificates.generateSelfSignedCodeSigningCertificate({ keyPair,
    validityNotBefore: new Date(Date.now() - 60_000), validityNotAfter: new Date(Date.now() + 3_600_000), commonName: 'Poduna test only' });
  assert.equal(certificate.verify(certificate), true);
  const pem = certificates.convertCertificateToCertificatePEM(certificate);
  assert.equal(certificates.convertCertificatePEMToCertificate(pem).verify(certificate), true);
  assert.doesNotThrow(() => certificates.validateSelfSignedCertificate(certificate, keyPair));
  assert.ok(certificates.signBufferRSASHA256AndVerify(privateKey, certificate, Buffer.from('Poduna')));
});

test('all four local security patches remain registered without disabling audits', () => {
  const workspace = fs.readFileSync(path.resolve(__dirname, '../pnpm-workspace.yaml'), 'utf8');
  for (const [name, version] of [['ip', '1.1.9'], ['braces', '3.0.3'], ['sprintf-js', '1.0.3'], ['node-forge', '1.4.0']]) {
    assert.ok(workspace.includes(`${name}@${version}: patches/${name}@${version}.patch`));
    assert.ok(fs.existsSync(path.resolve(__dirname, `../patches/${name}@${version}.patch`)));
  }
  assert.doesNotMatch(workspace, /allowUnusedPatches|ignoreCves|ignoreGhsas/);
});
