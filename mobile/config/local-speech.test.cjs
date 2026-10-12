const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { enableSpeechMicrophone } = require('../plugins/withLocalSpeech.cjs');

test('adds microphone permission once and clears the previous explicit removal', () => {
  const manifest = { 'uses-permission': [
    { $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove' } },
    { $: { 'android:name': 'another.permission', 'tools:node': 'remove' } },
  ] };
  enableSpeechMicrophone(manifest); enableSpeechMicrophone(manifest);
  assert.deepEqual(manifest['uses-permission'], [
    { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
    { $: { 'android:name': 'another.permission', 'tools:node': 'remove' } },
  ]);
  assert.equal(enableSpeechMicrophone({})['uses-permission'].length, 1);
});

test('native module has no default recognizer or automatic model download fallback', () => {
  const source = readFileSync(join(__dirname, '../modules/poduna-speech/android/src/main/java/expo/modules/podunaspeech/PodunaSpeechModule.kt'), 'utf8');
  assert.match(source, /SpeechRecognizer\.createOnDeviceSpeechRecognizer\(context\)/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 31/);
  assert.doesNotMatch(source, /\.createSpeechRecognizer\s*\(|\.triggerModelDownload\s*\(/);
  const config = require('../app.json').expo;
  assert.ok(config.plugins.includes('./plugins/withLocalSpeech.cjs'));
  assert.ok(config.android.permissions.includes('RECORD_AUDIO'));
  assert.ok(!config.android.blockedPermissions?.includes('android.permission.RECORD_AUDIO'));
});
