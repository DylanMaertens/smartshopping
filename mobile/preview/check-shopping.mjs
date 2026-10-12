// Browser QA of real components with fixture storage only. Does not touch site captures.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const mobile = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(mobile, '.preview/shopping-qa');
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
await mkdir(output, { recursive: true });
const fixtures = resolve(mobile, 'preview/fixtures.ts'), native = resolve(mobile, 'preview/native.tsx');
const result = await build({ absWorkingDir: mobile, entryPoints: ['preview/index.tsx'], bundle: true, write: false,
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  alias: { 'react-native': 'react-native-web', 'react-native-qrcode-svg': native, 'expo-camera': native, 'expo': fixtures },
  plugins: [{ name: 'fixtures', setup(builder) {
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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button', { name: 'Courses de la semaine', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
    for (const name of ['Quinoa', 'Oranges', 'Orange']) {
      await page.getByTestId('add-item-input').fill(name);
      await page.getByTestId('add-item-button').click();
    }
    const add = await page.getByTestId('add-item-button').boundingBox();
    assert.ok(add.height >= 48 && add.height <= 52);
    assert.equal(await page.getByRole('button', { name: 'Diminuer la quantité à ajouter', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Quantité à ajouter', { exact: true }).inputValue(), '1');
    await page.screenshot({ path: `${output}/quantity-one-${width}.png` });
    await page.getByRole('button', { name: 'Augmenter la quantité à ajouter', exact: true }).click();
    assert.equal(await page.getByLabel('Quantité à ajouter', { exact: true }).inputValue(), '2');
    for (const control of ['Augmenter la quantité à ajouter', 'Diminuer la quantité à ajouter']) {
      const bounds = await page.getByRole('button', { name: control, exact: true }).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `${control} clipped at ${width}px`);
      assert.ok(bounds.width >= 48 && bounds.height >= 48);
    }
    await page.screenshot({ path: `${output}/add-${width}.png` });
    await page.getByRole('button', { name: 'Diminuer la quantité à ajouter', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Diminuer la quantité à ajouter', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Modifier Orange', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Diminuer la quantité de Quinoa', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Quantité : 1', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Augmenter la quantité de Quinoa', exact: true }).click();
    await page.getByRole('button', { name: 'Diminuer la quantité de Quinoa', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/list-quantities-${width}.png` });
    await page.getByRole('button', { name: 'Diminuer la quantité de Quinoa', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Diminuer la quantité de Quinoa', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Modifier Quinoa', exact: true }).click();
    await page.getByRole('button', { name: 'Choisir le rayon', exact: true }).click();
    assert.equal(await page.getByRole('radio').count(), 27);
    for (const name of ['Animaux', 'Parapharmacie', 'Soins visage, corps & cheveux', 'Hygiène & beauté']) {
      assert.equal(await page.getByRole('radio', { name, exact: true }).count(), 1);
    }
    await page.getByRole('radio', { name: 'Épicerie salée', exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
    await page.getByTestId('add-item-input').fill('Quinoa');
    assert.equal(await page.getByText('Rayon mémorisé', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Choisir le rayon du produit à ajouter', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/remembered-${width}.png` });
    await page.getByRole('button', { name: 'Produit', exact: true }).waitFor();
    await page.getByTestId('add-item-input').fill('Zorblax');
    await page.getByRole('button', { name: 'Choisir le rayon du produit à ajouter', exact: true }).click();
    await page.getByRole('radio', { name: 'Animaux', exact: true }).click();
    await page.getByText('Rayon : Animaux', { exact: true }).waitFor();
    await page.getByTestId('add-item-button').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/manual-aisle-${width}.png` });
    await page.getByTestId('add-item-button').click();
    await page.getByTestId('add-item-input').fill('Zorblax');
    assert.equal(await page.getByRole('button', { name: 'Choisir le rayon du produit à ajouter', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier Zorblax', exact: true }).click();
    await page.getByText('Rayon : Animaux', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Shopping QA OK: 320/390px, buttons >=48px, quantities compact at one and editable above one, singular grouping, 27 aisles, manual aisle selection and hidden recognized/remembered category.');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
