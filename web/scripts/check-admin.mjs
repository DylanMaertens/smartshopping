import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('../.qa/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.SMARTSHOPPING_CHROMIUM, args: ['--no-sandbox'] });
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:8057/') || request.url().includes('/api/')) unexpected.push(request.url());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto('http://127.0.0.1:8057/admin/index.html#supervision');
    await page.getByRole('heading', { name: 'Supervision', exact: true }).waitFor();
    for (const route of ['supervision', 'journaux', 'moderation', 'messages']) {
      await page.locator(`nav a[href="#${route}"]`).click();
      await page.locator(`#view-${route}`).waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-page]:visible').count(), 1);
      assert.equal(await page.locator('nav [aria-current="page"]').count(), 1);
      assert.equal(await page.locator('h1:visible').count(), 1);
      await page.screenshot({ path: `${output}/admin-${route}-${width}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflow ${width}`);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflow 200% ${width}`);
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    }
    await page.locator('nav a[href="#supervision"]').click();
    await page.getByRole('link', { name: 'Consulter cet événement' }).click();
    await page.waitForFunction(() => document.getElementById('log-search').value === 'DEMO-REQ-1042');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByText('Détails de l’événement', { exact: true }).click();
    assert.ok(await page.locator('details[open]').count());
    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    await page.locator('#log-level').selectOption('error');
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.locator('#log-service').selectOption('sync');
    await page.getByText('Aucun événement ne correspond à ces filtres.').waitFor();
    await page.locator('nav a[href="#moderation"]').click();
    assert.equal(await page.locator('[data-case]').count(), 3);
    await page.getByLabel('Rechercher un dossier').fill('inexistant');
    await page.getByText('Aucun dossier ne correspond à ces filtres.').waitFor();
    await page.getByLabel('Rechercher un dossier').fill('');
    await page.getByRole('button', { name: 'Prévisualiser la décision' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('#decision').selectOption('withdrawn');
    const note = '<img src=x onerror=alert(1)> Exemple de décision motivée.';
    await page.getByLabel('Motif de la décision').fill(note);
    await page.getByRole('button', { name: 'Prévisualiser la décision' }).click();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(await page.locator('#pending-total').textContent(), '3');
    await page.getByRole('button', { name: 'Prévisualiser la décision' }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.getByRole('button', { name: 'Prévisualiser la décision' }).click();
    await page.getByRole('button', { name: 'Confirmer la simulation', exact: true }).click();
    assert.equal(await page.locator('#pending-total').textContent(), '2');
    assert.equal(await page.locator('#case-detail img').count(), 0);
    await page.getByText(note, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Réinitialiser la démonstration' }).click();
    assert.equal(await page.locator('#pending-total').textContent(), '3');
    await page.reload();
    assert.equal(await page.locator('#pending-total').textContent(), '3');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(`${width}px OK: navigation, 200% text, filters, empty states, decisions, cancel/Escape, escaped notes, demo reset, no API calls`);
    await page.close();
  }
} finally { await browser.close(); }
