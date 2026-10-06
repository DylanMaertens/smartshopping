import { context } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve('.preview');
await mkdir(out, { recursive: true });
await copyFile('assets/fonts/Silkscreen-Regular.ttf', out + '/pixel.ttf');
await writeFile(out + '/index.html', `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SmartShopping — aperçu UI avec données fictives</title><style>@font-face{font-family:Silkscreen;src:url('/pixel.ttf')}html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column;overflow:hidden}body{font-family:system-ui}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>`);
const fixtures = resolve('preview/fixtures.ts');
const native = resolve('preview/native.tsx');
const ctx = await context({ entryPoints: ['preview/index.tsx'], bundle: true, outfile: out + '/app.js', sourcemap: true, resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  alias: { 'react-native': 'react-native-web', 'react-native-qrcode-svg': native, 'expo-camera': native, 'expo': fixtures },
  plugins: [{ name: 'isolated-preview', setup(build) {
    build.onResolve({ filter: /services\/backup\/backupFiles$/ }, () => ({ path: resolve('preview/backupFiles.ts') }));
    build.onResolve({ filter: /(shoppingListStorage|useOfflineSync|localKeyValueStorage|services\/api\/backend|services\/api\/testServer|deviceIdentity|deviceDiagnostics)$/ }, () => ({ path: fixtures }));
  } }],
});
await ctx.watch();
await ctx.serve({ host: '127.0.0.1', port: 8048, servedir: out });
console.log('UI preview (fixtures only): http://127.0.0.1:8048');
