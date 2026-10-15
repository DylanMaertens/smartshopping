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
        recognize: async () => location.search.includes('corrections') ? '1 puis un lait puis wwhisky' : 'deux oranges, puis du lait, puis trois yaourts', stop: async () => {}, cancel: async () => {}
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
    const checkFixedReturn = async () => {
      const result = await page.evaluate(async () => {
        const scroll = document.querySelector('[data-testid="voice-scroll"]');
        const footer = document.querySelector('[data-testid="voice-footer"]');
        const button = footer?.querySelector('[role="button"]');
        if (!scroll || !footer || !button) return { valid: false };
        const samples = [];
        for (let frame = 0; frame < 90; frame++) {
          // Repeated end-of-content scrolling must never move or hide navigation.
          scroll.scrollTop = frame % 3 === 0 ? 0 : scroll.scrollHeight;
          await new Promise(requestAnimationFrame);
          const box = button.getBoundingClientRect(), style = getComputedStyle(button);
          samples.push({ y: box.y, height: box.height, opacity: style.opacity,
            visible: style.visibility === 'visible' && box.bottom <= innerHeight && box.y >= 0 });
        }
        return { valid: !scroll.contains(footer), samples };
      });
      assert.ok(result.valid, 'Return navigation must be outside the scroll area');
      assert.ok(result.samples.every((sample) => sample.visible && sample.height >= 48 && sample.opacity === '1'));
      assert.ok(result.samples.every((sample) => Math.abs(sample.y - result.samples[0].y) < 1), 'Return navigation moved while scrolling');
    };
    await open();
    await checkFixedReturn();
    await page.getByRole('button', { name: 'Commencer la dictée', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '2 x Orange\nLait\n3 x Yaourt');
    await checkFixedReturn();
    const originalFooter = await page.getByTestId('voice-footer').boundingBox();
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const route of ['scanner', 'product', 'product-scanner']) {
        if (route.startsWith('product')) {
          await page.getByRole('button', { name: 'Produit', exact: true }).click();
          assert.equal(await page.getByTestId('add-item-input').inputValue(), 'Zorblax');
          // Exercise reduced/restored available height. This is not a native IME.
          await page.setViewportSize({ width, height: 550 });
        }
        if (route.includes('scanner')) await page.getByRole('button', { name: 'Scanner un produit ou une liste', exact: true }).click();
        await page.getByRole('button', { name: 'Dicter des articles', exact: true }).click();
        if (route.startsWith('product')) {
          const reduced = await page.getByTestId('voice-footer').boundingBox();
          assert.ok(Math.abs(reduced.height - originalFooter.height) < 1, 'Return footer changed height in reduced viewport');
          await page.setViewportSize({ width, height: 850 });
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const footer = await page.getByTestId('voice-footer').boundingBox();
        assert.ok(Math.abs(footer.height - originalFooter.height) < 1 && Math.abs(footer.y - originalFooter.y) < 1,
          `Return footer grew or moved after ${route}, iteration ${repeat}`);
        assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '2 x Orange\nLait\n3 x Yaourt');
        assert.ok(await page.evaluate(() => window.addModalNode === document.querySelector('[data-testid="add-modal"]')));
      }
    }
    await page.screenshot({ path: `${output}/fixed-return-${width}.png` });
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
    await open('?corrections');
    await page.getByRole('button', { name: 'Commencer la dictée', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '1\n1 x Lait\nWwhisky');
    assert.equal(await page.getByRole('button', { name: 'Remplacer 1 par Pain', exact: true }).count(), 0);
    const correction = page.getByRole('button', { name: 'Remplacer Wwhisky par Whisky', exact: true });
    await correction.scrollIntoViewIfNeeded();
    await checkFixedReturn();
    await page.screenshot({ path: `${output}/corrections-${width}.png` });
    const bounds = await correction.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 48);
    await correction.click();
    assert.equal(await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).inputValue(), '1\n1 x Lait\nWhisky');
    await page.getByRole('button', { name: 'Annuler la dernière correction', exact: true }).click();
    await correction.click();
    await page.getByRole('textbox', { name: 'Articles dictés à vérifier' }).fill('Pain\n1 x Lait\nWhisky');
    await page.getByRole('button', { name: 'Ajouter les articles à la liste', exact: true }).click();
    await page.getByRole('button', { name: 'Modifier Pain', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modifier Whisky', exact: true }).waitFor();
    await open('?unavailable');
    await page.getByText(/La dictée locale n’est pas disponible/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Commencer la dictée', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/unavailable-${width}.png` });
    await page.getByRole('button', { name: 'Retour à l’ajout manuel', exact: true }).click();
    await page.getByTestId('add-item-input').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Add-flow UI fixtures OK: 320/390px, fixed footer stable across scrolling and repeated voice/product/scanner routes with reduced/restored viewport, same modal, preserved drafts, opt-in corrections, explicit import and unavailable/manual fallback. No microphone or native keyboard used.');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
