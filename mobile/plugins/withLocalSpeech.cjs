const { withAndroidManifest } = require('expo/config-plugins');

// Older Poduna prebuilds explicitly removed this permission. Merely adding it
// to app.json does not clear tools:node="remove" during an incremental prebuild.
function enableSpeechMicrophone(manifest) {
  const permissions = manifest['uses-permission'] ??= [];
  const existing = permissions.find((entry) => entry.$['android:name'] === 'android.permission.RECORD_AUDIO');
  if (existing) delete existing.$['tools:node'];
  else permissions.push({ $: { 'android:name': 'android.permission.RECORD_AUDIO' } });
  return manifest;
}

module.exports = (config) => withAndroidManifest(config, (mod) => {
  enableSpeechMicrophone(mod.modResults.manifest);
  return mod;
});
module.exports.enableSpeechMicrophone = enableSpeechMicrophone;
