const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// ML Kit discovers these registrars through Android manifest metadata and
// reflection. Keeping the class alone does not retain its no-arg constructor
// with the current R8 optimizer (observed in the 0.1.17 release APK).
const RULE = `# Poduna: preserve ML Kit's reflectively instantiated registrars.
-keep class com.google.mlkit.** implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}`;

function addRegistrarRules(contents) {
  if (contents.includes(RULE)) return contents;
  return `${contents.trimEnd()}\n\n${RULE}\n`;
}

module.exports = (config) => withDangerousMod(config, ['android', async (mod) => {
  const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
  const contents = await fs.readFile(file, 'utf8');
  const next = addRegistrarRules(contents);
  if (next !== contents) await fs.writeFile(file, next);
  return mod;
}]);
module.exports.addRegistrarRules = addRegistrarRules;
