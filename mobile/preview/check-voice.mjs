// UI-only fixture: no microphone, recognition provider or real app storage.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const mobile = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(mobile, '.preview/voice-qa');
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const fixtures = resolve(mobile, 'preview/fixtures.ts'), native = resolve(mobile, 'preview/native.tsx');
const result = await build({ absWorkingDir: mobile, entryPoints: ['preview/index.tsx'], bundle: true, write: false,
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  alias: { 'react-native': 'react-native-web', 'react-native-qrcode-svg': native, 'expo-camera': native, 'expo': fixtures },
  plugins: [{ name: 'isolated-voice-fixture', setup(builder) {
    builder.onResolve({ filter: /services\/localSpeech$/ }, () => ({ path: 'voice', namespace: 'voice-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'voice-fixture' }, () => ({ contents: `
      export const localSpeech = {
        isAvailable: async () => !location.search.includes('unavailable'), requestPermission: async () => true,
        recognize: async () => 'deux oranges, puis du lait, puis trois yaourts', stop: async () => {}, cancel: async () => {}
      };
      export const speechErrorMessage = () => 'Erreur simulée';
    ` }));
    builder.onResolve({ filter: /services\/backup\/backupFiles$/ }, () => ({ path: resolve(mobile, 'preview/backupFiles.ts') }));
    builder.onResolve({ filter: /(shoppingListStorage|useOfflineSync|localKeyValueStorage|services\/api\/backend|services\/api\/testServer|deviceIdentity|deviceDiagnostics)$/ }, () => ({ path: fixtures }));
  } }],
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? result.outputFiles[0].contents : '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const open = async (query = '') => {
      await page.goto(`http://127.0.0.1:${server.address().port}/${query}`);
      await page.getByRole('button', { name: 'Courses de la semaine', exact: true }).click();
      await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
      await page.getByTestId('add-item-input').fill('Zorblax');
      await page.getByRole('textbox', { name: 'Quantité à ajouter', exact: true }).fill('3');
      assert.ok(await page.evaluate(() => { window.addModalNode = document.querySelector('[data-testid="add-modal"]'); return !!window.addModalNode; }));
      await page.getByRole('button', { name: 'Dicter des articles', exact: true }).click();
    };
    await open();
    await page.getByRole('button', { name: 'Commencer la dictée', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '2 x Orange\nLait\n3 x Yaourt');
    await page.getByRole('button', { name: 'Scanner un produit ou une liste', exact: true }).click();
    await page.getByRole('radio', { name: 'Scanner un code-barres', exact: true }).waitFor();
    assert.equal(await page.getByText('Caméra · à vérifier sur Android', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Photographier et reconnaître', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/barcode-${width}.png` });
    await page.getByRole('radio', { name: 'Scanner une liste écrite', exact: true }).click();
    assert.equal(await page.getByText('Caméra · à vérifier sur Android', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Photographier et reconnaître', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/photo-${width}.png` });
    await page.getByRole('button', { name: 'Photographier et reconnaître', exact: true }).click();
    await page.getByRole('textbox', { name: 'Articles reconnus', exact: true }).fill('4 x Pain');
    await page.getByRole('radio', { name: 'Scanner un code-barres', exact: true }).click();
    await page.getByRole('radio', { name: 'Scanner une liste écrite', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles reconnus', exact: true }).inputValue(), '4 x Pain');
    await page.getByRole('button', { name: 'Fermer Ajouter un article', exact: true }).click();
    assert.equal(await page.getByTestId('add-item-input').inputValue(), 'Zorblax');
    assert.equal(await page.getByRole('textbox', { name: 'Quantité à ajouter', exact: true }).inputValue(), '3');
    assert.ok(await page.evaluate(() => window.addModalNode === document.querySelector('[data-testid="add-modal"]')), 'Add modal was remounted');
    await page.getByRole('button', { name: 'Dicter des articles', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '2 x Orange\nLait\n3 x Yaourt');
    await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/review-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: 'Ajouter les articles à la liste', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier Orange', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modifier Yaourt', exact: true }).waitFor();
    await open('?unavailable');
    await page.getByText(/La dictée locale n’est pas disponible/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Commencer la dictée', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/unavailable-${width}.png` });
    await page.getByRole('button', { name: 'Retour à l’ajout manuel', exact: true }).click();
    await page.getByTestId('add-item-input').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Add-flow UI fixtures OK: 320/390px, same modal across modes/back, exclusive barcode/photo switch, preserved manual/OCR/voice drafts, explicit import and unavailable/manual fallback. No microphone used.');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
