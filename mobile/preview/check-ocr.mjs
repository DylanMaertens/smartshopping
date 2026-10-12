// Isolated RN-web visual/interaction regression; no real camera, photo, backend or list.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const mobile = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(mobile, '.preview/ocr-review');
const sample = "Litiéne\nSanex\nwwhisky\nYacan'ts\noRange\nFromage\nResd\nViande\nclaquelte";
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
await mkdir(out, { recursive: true });
await writeFile(out + '/index.html', '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{height:100%;margin:0;background:#f9f8f2}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script></html>');
await build({ absWorkingDir: mobile, bundle: true, outfile: out + '/app.js',
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
  stdin: { resolveDir: mobile, loader: 'tsx', contents: `import React from 'react';
    import { createRoot } from 'react-dom/client'; import { OcrImportPanel } from './src/components/OcrImportPanel';
    createRoot(document.getElementById('root')).render(<OcrImportPanel onCancel={() => {}} onImport={(items) => { window.importedItems = items; }} />);` },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  alias: { 'react-native': 'react-native-web' },
  plugins: [{ name: 'ocr-fixtures', setup(builder) {
    builder.onResolve({ filter: /BarcodeScannerPanel$/ }, () => ({ path: 'camera', namespace: 'fixture' }));
    builder.onResolve({ filter: /services\/api\/backend$/ }, () => ({ path: 'backend', namespace: 'fixture' }));
    builder.onResolve({ filter: /localKeyValueStorage$/ }, () => ({ path: 'storage', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: mobile, contents: path === 'camera'
      ? `import React from 'react'; export const BarcodeScannerPanel = ({onPhotographed}) => <button onClick={() => onPhotographed('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=')}>Photo fictive</button>;`
      : path === 'backend' ? `export class BackendApiError extends Error {} export const recognizeListPhoto = async () => ({text:${JSON.stringify(sample)}});`
      : 'export const LocalKeyValueStorage = {getString: () => null, setString: () => {}};' }));
  } }],
});
const server = createServer(async (req, res) => {
  const file = req.url === '/app.js' ? 'app.js' : 'index.html';
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(await readFile(out + '/' + file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button', { name: 'Photo fictive' }).click();
    const editor = page.getByRole('textbox', { name: 'Articles reconnus' });
    assert.equal(await editor.inputValue(), sample);
    await page.getByRole('button', { name: 'Appliquer les 2 corrections probables' }).click();
    assert.equal(await editor.inputValue(), sample.replace('Litiéne', 'Litière').replace('wwhisky', 'whisky'));
    await page.getByRole('button', { name: 'Annuler la dernière correction' }).click();
    assert.equal(await editor.inputValue(), sample);
    await page.getByRole('button', { name: "Remplacer Yacan'ts par Yaourts", exact: true }).click();
    assert.ok((await editor.inputValue()).includes('Yaourts'));
    await page.getByRole('button', { name: 'Appliquer les 2 corrections probables' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/review-${width}.png` });
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('[role="button"],textarea')].every((node) => {
      const bounds = node.getBoundingClientRect(); return bounds.left >= -1 && bounds.right <= innerWidth + 1;
    })), `Controls overflow at ${width}px`);
    await page.getByRole('button', { name: 'Ajouter les 9 lignes' }).click();
    assert.equal(await page.evaluate(() => window.importedItems.length), 9);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('OCR review: 320/390px, batch, uncertain choice, undo, import and no horizontal overflow OK.');
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
