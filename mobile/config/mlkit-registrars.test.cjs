const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addRegistrarRules } = require('../plugins/withMlKitRegistrars.cjs');

test('release builds retain ML Kit registrar constructors without disabling optimization', () => {
  const existing = '# Existing app rules\n-keep class example.Existing { *; }\n';
  const result = addRegistrarRules(existing);
  assert.ok(result.startsWith(existing));
  assert.match(result, /-keep class com\.google\.mlkit\.\*\* implements com\.google\.firebase\.components\.ComponentRegistrar \{\s+public <init>\(\);\s+\}/);
  assert.doesNotMatch(result, /-dont(?:shrink|optimize|obfuscate)/);
  assert.equal(addRegistrarRules(result), result);
});

test('the rule also applies to a fresh prebuild and the plugin is registered', () => {
  assert.match(addRegistrarRules(''), /public <init>\(\);/);
  assert.ok(require('../app.json').expo.plugins.includes('./plugins/withMlKitRegistrars.cjs'));
});
