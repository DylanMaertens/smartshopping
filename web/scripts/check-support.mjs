import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('../.qa/', import.meta.url));
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:8057';
const browser = await chromium.launch({ headless: true, executablePath: process.env.SMARTSHOPPING_CHROMIUM, args: ['--no-sandbox'] });
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      if (!request.url().startsWith(`${base}/`) || request.url().includes('/api/') || request.method() !== 'GET' || new URL(request.url()).search) unexpected.push(request.url());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/contact.html`);
    assert.equal(await page.locator('#contact-fields').isEnabled(), true);
    await page.screenshot({ path: `${output}/contact-${width}.png`, fullPage: true });
    for (const fontSize of ['200%', '']) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, fontSize);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `contact overflow ${fontSize} ${width}`);
    }
    await page.getByRole('button', { name: 'Prévisualiser le message' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('#contact-email').fill('camille@example.invalid');
    await page.locator('#contact-topic').selectOption({ label: 'Problème technique' });
    await page.locator('#contact-message').fill('                       ');
    await page.getByRole('button', { name: 'Prévisualiser le message' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    const body = '<img src=x onerror=alert(1)> Exemple de message fictif pour le support.';
    await page.locator('#contact-message').fill(body);
    await page.getByRole('button', { name: 'Prévisualiser le message' }).click();
    assert.equal(await page.locator('#preview-body').textContent(), body);
    assert.equal(await page.locator('#preview-body img').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('#contact-message').inputValue(), body);
    await page.getByRole('button', { name: 'Prévisualiser le message' }).click();
    await page.getByRole('button', { name: 'Revenir au formulaire' }).click();
    await page.reload();
    assert.equal(await page.locator('#contact-message').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);

    await page.goto(`${base}/admin/index.html#messages`);
    await page.locator('#message-title').waitFor();
    assert.equal(await page.locator('[data-message]').count(), 3);
    await page.screenshot({ path: `${output}/admin-messages-${width}.png`, fullPage: true });
    for (const fontSize of ['200%', '']) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, fontSize);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `messages overflow ${fontSize} ${width}`);
    }
    await page.locator('#message-search').fill('introuvable');
    assert.equal(await page.locator('[data-message]').count(), 0);
    await page.locator('#message-search').fill('camille');
    assert.equal(await page.locator('[data-message]').count(), 1);
    await page.locator('#message-search').fill('');
    await page.locator('#message-filter').selectOption('unread');
    assert.equal(await page.locator('[data-message]').count(), 1);
    await page.getByRole('button', { name: 'Marquer comme lu', exact: true }).click();
    assert.equal(await page.locator('[data-message]').count(), 0);
    await page.locator('#message-filter').selectOption('all');
    await page.getByRole('button', { name: 'Prévisualiser la réponse' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('#reply-body').fill(body);
    await page.locator('[data-message="DEMO-MSG-002"]').click();
    assert.equal(await page.locator('#reply-body').inputValue(), '');
    await page.locator('[data-message="DEMO-MSG-003"]').click();
    assert.equal(await page.locator('#reply-body').inputValue(), body);
    await page.locator('nav a[href="#supervision"]').click();
    await page.locator('nav a[href="#messages"]').click();
    assert.equal(await page.locator('#reply-body').inputValue(), body);
    await page.getByRole('button', { name: 'Prévisualiser la réponse' }).click();
    assert.equal(await page.locator('#reply-preview-body').textContent(), body);
    assert.equal(await page.locator('#reply-preview-body img').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Envoi indisponible' }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#message-state').inputValue(), 'new');
    await page.locator('#message-state').selectOption('active');
    await page.locator('#message-filter').selectOption('active');
    assert.equal(await page.locator('[data-message]').count(), 2);
    await page.locator('#message-state').selectOption('closed');
    await page.locator('#message-filter').selectOption('closed');
    assert.equal(await page.locator('[data-message]').count(), 2);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Réinitialiser les messages' }).click();
    assert.equal(await page.locator('#reply-body').inputValue(), body);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Réinitialiser les messages' }).click();
    assert.equal(await page.locator('#reply-body').inputValue(), '');
    assert.equal(await page.locator('#message-state').inputValue(), 'new');
    await page.locator('#reply-body').fill('Une nouvelle réponse fictive.');
    await page.reload();
    await page.locator('#reply-body').waitFor();
    assert.equal(await page.locator('#reply-body').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(`${width}px OK: Contact, validation, preview, Messages, filters, statuses, drafts, reset, reload, escaping, no transmission/storage`);
    await page.close();
  }
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto(`${base}/contact.html`);
  assert.equal(await page.locator('#contact-email').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Prévisualiser le message' }).isDisabled(), true);
  await page.close();
  console.log('OK: Contact safely disabled without JavaScript.');
} finally { await browser.close(); }
