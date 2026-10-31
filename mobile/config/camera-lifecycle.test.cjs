const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Android compiles the patched camera instead of the unpatched prebuilt AAR', () => {
  const pkg = require('../package.json');
  assert.ok(pkg.expo.autolinking.android.buildFromSource.includes('expo-camera'));
  const cameraRoot = path.dirname(require.resolve('expo-camera/package.json'));
  const source = fs.readFileSync(path.join(cameraRoot, 'android/src/main/java/expo/modules/camera/ExpoCameraView.kt'), 'utf8');
  assert.match(source, /fun cleanupCamera\(\) \{\s*pausePreview\(\)\s*cameraSession\.destroy\(\)/);
  assert.match(source, /override fun onDetachedFromWindow\(\) \{[\s\S]*?pausePreview\(\)[\s\S]*?super\.onDetachedFromWindow\(\)/);
  assert.match(source, /override fun onAttachedToWindow\(\) \{[\s\S]*?enableTorch = false[\s\S]*?flashMode = FlashMode\.OFF[\s\S]*?resumePreview\(\)/);
  assert.match(source, /enableTorch\(enabled && isAttachedToWindow && !previewPaused\)/);
  const pause = source.split('fun pausePreview() {')[1].split('\n  }')[0];
  assert.match(pause, /cameraSession\.stop\(\)[\s\S]*?cameraStateSubscription\.clear\(\)[\s\S]*?enableTorch = false[\s\S]*?flashMode = FlashMode\.OFF[\s\S]*?camera = null/);
  assert.match(pause, /cameraProvider\?\.unbind\(\*boundUseCases\.toTypedArray\(\)\)/);
  assert.doesNotMatch(pause, /unbindAll/);
  assert.match(source, /awaitInstance\(context\)[\s\S]*?if \(!cameraSession\.isCurrent\(request\) \|\| !isAttachedToWindow\) return/);
  assert.doesNotMatch(source, /cameraInfo\.cameraState\.observe\(currentActivity\)/);
  assert.match(source, /cameraStateSubscription\.observe\(cameraInfo\.cameraState, currentActivity\)/);
});
