// Real Rust backend, isolated data, self-signed HTTPS on loopback only. Never uses the live tunnel/database.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as httpsServer } from 'node:https';
import { createServer as tcpServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.SMARTSHOPPING_PLAYWRIGHT_MODULE || 'playwright');
const backend = process.env.PODUNA_TEST_BACKEND || resolve('backend/target/debug/shopping-list-backend');
const hasher = process.env.PODUNA_TEST_HASHER || resolve('backend/target/debug/admin-password-hash');
const temp = await mkdtemp(join(tmpdir(), 'poduna-admin-qa-'));
const output = resolve('web/.qa/live-admin');
await mkdir(output, { recursive: true });
let child, proxy, browser;
const password = 'Fixture-only password, never deployed!';
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(temp, 'key.pem'), '-out', join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const hash = execFileSync(hasher, { input: password, encoding: 'utf8' }).trim();
  await writeFile(join(temp, 'credentials.json'), JSON.stringify({ username: 'qa-owner', password_hash: hash }), { mode: 0o600 });
  const reservation = tcpServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  proxy = httpsServer({ key: await readFile(join(temp, 'key.pem')), cert: await readFile(join(temp, 'cert.pem')) }, (req, res) => {
    const upstream = httpRequest({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
  });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const origin = `https://127.0.0.1:${proxy.address().port}`;
  child = spawn(backend, [], { env: { PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(port),
    ADMIN_CREDENTIALS_FILE: join(temp, 'credentials.json'), ADMIN_ORIGIN: origin,
    DEVICE_REGISTRY_PATH: join(temp, 'devices.json'), REQUIRE_DEVICE_SIGNATURES: 'true', ENABLE_OFF_PROXY: 'false', RUST_LOG: 'error' }, stdio: 'ignore' });
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null || attempt > 50) throw new Error('Isolated backend did not start');
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  await fetch(`http://127.0.0.1:${port}/api/v1/products/PRIVATE_BARCODE?secret=PRIVATE_QUERY`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 1000 } });
    const page = await context.newPage(); const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (!req.url().startsWith(origin)) external.push(req.url()); });
    await page.goto(`${origin}/admin/`);
    await page.locator('#login-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#dashboard').isVisible(), false);
    await page.screenshot({ path: join(output, `login-${width}.png`), fullPage: true });
    if (width === 1440) {
      await page.locator('#username').fill('qa-owner'); await page.locator('#password').fill('wrong-password');
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByText('Identifiant ou mot de passe incorrect.', { exact: true }).waitFor();
      assert.equal(await page.locator('#password').inputValue(), '');
      assert.equal(await page.locator('#dashboard').isVisible(), false);
    }
    await page.locator('#username').fill('qa-owner'); await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('updated').textContent.startsWith('Actualisé'));
    assert.equal(await page.locator('#requests').textContent(), '1');
    assert.equal(await page.locator('#rejected').textContent(), '1');
    assert.ok((await page.locator('#services').textContent()).includes('Non configuré'));
    const cookie = (await context.cookies()).find(cookie => cookie.name === '__Host-poduna_admin');
    assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Strict');
    assert.equal(await page.evaluate(() => document.cookie), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.reload(); await page.locator('#dashboard').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('updated').textContent.startsWith('Actualisé'));
    for (const tab of ['supervision', 'journaux']) {
      await page.locator(`nav a[href="#${tab}"]`).click();
      await page.screenshot({ path: join(output, `${tab}-${width}.png`), fullPage: true });
      for (const size of ['200%', '']) {
        await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tab}: overflow ${width}/${size}`);
      }
    }
    assert.ok((await page.locator('#log-results').textContent()).includes('/api/v1/products/:barcode'));
    assert.ok(!(await page.locator('#log-results').textContent()).includes('PRIVATE_'));
    await page.locator('#search').fill('missing-event');
    await page.getByText('Aucun événement ne correspond à ces filtres.').waitFor();
    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    await page.locator('#service').selectOption('admin');
    assert.ok((await page.locator('#log-results').textContent()).includes('ADMIN_LOGIN_OK'));
    assert.ok(!(await page.locator('#log-results').textContent()).includes('/api/v1/products/'));
    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    if (width === 320) {
      await page.route('**/admin/api/overview', route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } }));
      await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
      await page.getByText('Données potentiellement périmées — actualisation échouée', { exact: true }).waitFor();
      await page.unroute('**/admin/api/overview');
      await page.route('**/admin/api/logs', route => route.fulfill({ json: { events: [{ time: new Date().toISOString(), reference: '<img src=x onerror=alert(1)>', level: 'error', code: '<script>bad()</script>', route: '/other', service: 'api', status: 500, duration_ms: 1, method: 'GET' }] } }));
      await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
      await page.getByText('<script>bad()</script>', { exact: true }).waitFor();
      assert.equal(await page.locator('#log-results img, #log-results script').count(), 0);
      await page.unroute('**/admin/api/logs');
    }
    for (const tab of ['moderation','messages']) {
      await page.locator(`nav a[href="#${tab}"]`).click();
      await page.locator(`#${tab}-info`).getByText(/Base de données indisponible\. Aucun résultat ni enregistrement confirmé\./).waitFor();
      assert.equal(await page.locator(`#${tab}-results .card`).count(), 0);
      assert.ok(await page.locator(`#${tab}-next`).isDisabled());
    }
    const second = await context.newPage(); await second.goto(`${origin}/admin/`);
    await second.waitForFunction(() => document.getElementById('updated').textContent.startsWith('Actualisé'));
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await page.locator('#login-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#log-results').textContent(), '');
    await second.getByRole('button', { name: 'Actualiser', exact: true }).click();
    await second.locator('#login-panel').waitFor({ state: 'visible' });
    assert.equal((await context.cookies()).filter(cookie => cookie.name === '__Host-poduna_admin').length, 0);
    if (width === 320) {
      await page.route('**/admin/api/session', route => route.fulfill({ status: 503, json: { code: 'ADMIN_NOT_CONFIGURED' } }));
      await page.reload();
      await page.getByText('Accès administrateur non configuré sur ce serveur. Aucun mot de passe par défaut.', { exact: true }).waitFor();
      assert.equal(await page.locator('#login-panel').isVisible(), false);
      assert.equal(await page.locator('#dashboard').isVisible(), false);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`${width}px OK: real HTTPS login/session/logout, overview/logs, redaction, filters, 200% text, no JS token or storage, cross-tab revocation`);
    await context.close();
  }
} finally {
  await browser?.close();
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
  if (proxy) await new Promise(r => proxy.close(r));
  await rm(temp, { recursive: true, force: true });
}
