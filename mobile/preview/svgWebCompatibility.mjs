// SVG 15.16 conditionally requires this module only on Android. esbuild still
// resolves the require in browser previews; do not pull native TurboModules in.
// This plugin is never used by Metro or the Android application.
export const svgWebCompatibility = {
  name: 'svg-android-sound-unreachable-on-web',
  setup(build) {
    build.onResolve({ filter: /NativeSvgSoundModule$/ }, ({ importer }) =>
      importer.includes('/react-native-svg/') ? { path: 'sound', namespace: 'svg-web-only' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'svg-web-only' }, () => ({
      contents: 'export default { playTouchSound() { throw new Error("Android SVG sound must not run in a web preview"); } };',
    }));
  },
};
