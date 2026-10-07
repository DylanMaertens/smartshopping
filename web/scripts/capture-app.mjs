// Rebuild the real RN web preview using fixtures only; no app/backend is started.
import { createRequire } from 'node:module';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
const mobile = fileURLToPath(new URL('../../mobile/', import.meta.url));
const web = fileURLToPath(new URL('../', import.meta.url));
const captureThemes = process.argv.length > 2 ? process.argv.slice(2) : ['origine', 'minimal', 'papier', 'nuit'];
if (captureThemes.some(theme => !['origine', 'minimal', 'papier', 'nuit'].includes(theme))) throw new Error('Thème de capture inconnu');
const requireMobile = createRequire(mobile + '/package.json');
const { build } = requireMobile('esbuild');
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(web, '.qa/app');
await mkdir(output, { recursive: true });
await mkdir(resolve(web, 'dist/assets'), { recursive: true });
await copyFile(resolve(mobile, 'assets/fonts/Silkscreen-Regular.ttf'), output + '/pixel.ttf');
await writeFile(output + '/index.html', '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Silkscreen;src:url(/pixel.ttf)}html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column;overflow:hidden}body{font-family:system-ui}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>');
const fixtures = resolve(mobile, 'preview/fixtures.ts');
const native = resolve(mobile, 'preview/native.tsx');
await build({ absWorkingDir: mobile, entryPoints: ['preview/index.tsx'], bundle: true, outfile: output + '/app.js',
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  alias: { 'react-native': 'react-native-web', 'react-native-qrcode-svg': native, 'expo-camera': native, 'expo': fixtures },
  plugins: [{ name: 'fixtures-only', setup(build) {
    build.onResolve({ filter: /services\/backup\/backupFiles$/ }, () => ({ path: resolve(mobile, 'preview/backupFiles.ts') }));
    build.onResolve({ filter: /(shoppingListStorage|useOfflineSync|localKeyValueStorage|services\/api\/backend|services\/api\/testServer|deviceIdentity|deviceDiagnostics)$/ }, () => ({ path: fixtures }));
  } }],
});
const server = createServer(async (req, res) => {
  const filename = ({ '/': 'index.html', '/app.js': 'app.js', '/pixel.ttf': 'pixel.ttf' })[req.url];
  if (!filename) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.ttf') ? 'font/ttf' : 'text/html');
  res.end(await readFile(output + '/' + filename));
});
await new Promise((done) => server.listen(8058, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.SMARTSHOPPING_CHROMIUM, args: ['--no-sandbox'] });
  for (const theme of captureThemes) {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    page.on('pageerror', (error) => console.error(error.message));
    await page.addInitScript((theme) => localStorage.setItem('preview.appearance.theme.v1', theme), theme);
    await page.goto('http://127.0.0.1:8058/');
    await page.getByRole('button', { name: 'Courses de la semaine', exact: true }).click();
    await page.getByText('Fruits & légumes', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(web, `dist/assets/app-${theme}.png`) });
    await page.close();
  }
} finally { await browser?.close(); server.close(); }
