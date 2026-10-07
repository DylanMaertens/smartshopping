import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('../.qa/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.SMARTSHOPPING_CHROMIUM, args: ['--no-sandbox'] });
const errors = [];
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.goto('http://127.0.0.1:8057/', { waitUntil: 'networkidle' });
    await page.locator('#personnalisation').scrollIntoViewIfNeeded();
    await page.locator('#theme-screen').evaluate((image) => image.decode());
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.hero-visual img').getAttribute('src'), 'assets/app-origine.png');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    assert.equal(await page.locator('[data-version]').textContent(), '0.1.8');
    assert.equal(await page.locator('#download-link').getAttribute('href'), 'downloads/smartshopping-0.1.8-preview.apk');
    for (const theme of ['Minimal', 'Nuit', 'Papier', 'Origine']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: theme, exact: true }).getAttribute('aria-pressed'), 'true');
      await page.locator('#theme-screen').evaluate((image) => image.decode());
    }
    await page.getByText('Faut-il créer un compte ?', { exact: true }).click();
    assert.equal(await page.locator('details').first().evaluate((node) => node.open), true);
    await page.getByText('Faut-il créer un compte ?', { exact: true }).press('Enter');
    assert.equal(await page.locator('details').first().evaluate((node) => node.open), false);
    const missing = await page.locator('a[href^="#"]').evaluateAll((links) => links.map((link) => link.hash).filter((hash) => hash && hash !== '#' && !document.getElementById(hash.slice(1))));
    assert.deepEqual(missing, []);
    assert.equal(await page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    if ([1440, 390].includes(width)) {
      await page.screenshot({ path: `${output}/homepage-${width}.png`, fullPage: true });
      await page.screenshot({ path: `${output}/hero-${width}.png` });
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `text zoom overflow at ${width}`);
    await page.close();
  }
  const page = await browser.newPage();
  for (const file of ['downloads/smartshopping-0.1.8-preview.apk', 'downloads/smartshopping-0.1.8-preview.apk.sha256']) {
    const response = await page.request.head(`http://127.0.0.1:8057/${file}`);
    assert.equal(response.status(), 200);
  }
  assert.deepEqual(errors, []);
  console.log('OK: 4 viewports, text at 200%, themes, native FAQ keyboard, anchor links, images, downloads and no browser errors.');
} finally { await browser.close(); }
