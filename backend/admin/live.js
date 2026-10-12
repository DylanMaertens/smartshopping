import { setupWorkflows } from './workflows.js';
const $ = id => document.getElementById(id);
let csrf = null;
let events = [];
let busy = false;
let generation = 0;
const labels = { api: 'API', postgres: 'PostgreSQL', redis: 'Redis', catalogues: 'Catalogues produits', ocr: 'Lecture des listes', community: 'Communauté', sync: 'Synchronisation', admin: 'Accès administrateur' };
const statusLabels = { available: 'Disponible · vérifié', unavailable: 'Indisponible', not_configured: 'Non configuré', enabled_not_probed: 'Activé · non sondé', on_demand_not_probed: 'À la demande · non sondé', enabled: 'Activé', disabled: 'Désactivé' };
const levelLabels = { error: 'Erreur', warning: 'Attention', info: 'Information' };
labels.contact = 'Contact';
const number = value => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const date = value => new Date(value).toLocaleString('fr-FR');
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
function notice(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'notice error' : 'notice'; }

function lock(message = '') {
  workflows.reset();
  generation += 1; csrf = null; events = [];
  $('dashboard').hidden = true; $('logout').hidden = true; $('login-panel').hidden = false;
  $('connection').textContent = 'Non connecté'; $('password').value = '';
  $('log-results').replaceChildren(); $('services').replaceChildren(); $('activity').replaceChildren();
  for (const id of ['requests', 'latency', 'errors', 'rejected']) $(id).textContent = '—';
  $('updated').textContent = 'Pas encore actualisé'; $('count').textContent = '';
  notice(message);
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch(`/admin/api/${path}`, {
    ...options, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { 'X-Poduna-Admin': '1', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
  }); } catch { throw new Error('Connexion interrompue ou délai dépassé. Vérifiez le serveur puis réessayez.'); }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') lock('Session expirée. Reconnectez-vous.');
    const messages = {
      ADMIN_LOGIN_FAILED: 'Identifiant ou mot de passe incorrect.',
      ADMIN_LOGIN_THROTTLED: 'Trop de tentatives. Réessayez dans cinq minutes.',
      ADMIN_SESSION_EXPIRED: 'Session expirée. Reconnectez-vous.',
      ADMIN_NOT_CONFIGURED: 'Accès administrateur non configuré sur ce serveur. Aucun mot de passe par défaut.',
      ADMIN_ORIGIN_REJECTED: 'Adresse non autorisée. Ouvrez l’administration sur l’adresse HTTPS configurée.',
      ADMIN_PROXY_REJECTED: 'Accès refusé : le serveur attend son relais HTTPS local.',
      ADMIN_CSRF_REJECTED: 'Session invalide. Rechargez la page avant de réessayer.',
      WORKFLOW_UNAVAILABLE: 'Base de données indisponible. Aucun résultat ni enregistrement confirmé.',
      WORKFLOW_STALE: 'Ce dossier a changé. Fermez-le et actualisez avant de décider.',
      BAD_REQUEST: 'Demande invalide. Vérifiez le motif et la décision.',
    };
    const error = new Error(messages[data.code] || `Requête refusée (HTTP ${response.status}).`);
    error.code = data.code; error.reference = response.headers.get('x-request-id');
    if (error.reference && response.status >= 500) error.message += ` Référence : ${error.reference}`;
    throw error;
  }
  return data;
}
function loggedIn(data) {
  csrf = data.csrf; generation += 1;
  $('login-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
  $('connection').textContent = 'Session administrateur'; $('password').value = '';
  notice(''); navigate();
}
function navigate(focus = false) {
  const [target, query = ''] = location.hash.slice(1).split('?');
  const current = ['journaux','moderation','messages'].includes(target) ? target : 'supervision';
  for (const id of ['supervision','journaux','moderation','messages']) $(id).hidden = current !== id;
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === `#${current}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (query) { const value = new URLSearchParams(query).get('level'); $('level').value = Object.hasOwn(levelLabels, value) ? value : ''; renderLogs(); }
  if (csrf) workflows.refresh(current);
  if (focus && csrf) $(current === 'journaux' ? 'logs-title' : `${current}-title`).focus();
}
function renderOverview(data) {
  $('requests').textContent = number(data.traffic.requests);
  $('latency').textContent = `${number(data.traffic.mean_duration_ms)} ms`;
  $('errors').textContent = number(data.traffic.errors); $('rejected').textContent = number(data.traffic.rejected);
  $('services').replaceChildren(...Object.entries(data.services).map(([id, status]) => {
    const row = node('li'); row.append(node('strong', labels[id] || id), node('span', statusLabels[status] || 'Inconnu', `badge ${status === 'unavailable' ? 'error' : status === 'available' ? 'good' : ''}`)); return row;
  }));
  const counters = data.counters;
  const activity = [
    ['Processus démarré depuis', `${number(data.traffic.uptime_seconds / 60)} min`],
    ['Cache produit · succès / absences', `${number(counters.cache_hits)} / ${number(counters.cache_misses)}`],
    ['Catalogues · réussites / échecs', `${number(counters.catalogue_successes)} / ${number(counters.catalogue_failures)}`],
    ['Synchronisations · réussites / tentatives', `${number(counters.sync_successes)} / ${number(counters.sync_attempts)}`],
    ['Limites de débit atteintes', number(counters.rate_limit_rejections)],
  ];
  $('activity').replaceChildren(...activity.map(([name, value]) => { const row = node('div'); row.append(node('dt', name), node('dd', value)); return row; }));
}
function renderLogs() {
  const search = $('search').value.toLocaleLowerCase('fr');
  const shown = events.filter(event => (!$('level').value || event.level === $('level').value)
    && (!$('service').value || event.service === $('service').value)
    && `${event.reference} ${event.route} ${event.code}`.toLocaleLowerCase('fr').includes(search));
  $('count').textContent = `${shown.length} événement(s) sur ${events.length} conservés`;
  if (!shown.length) { $('log-results').replaceChildren(node('p', 'Aucun événement ne correspond à ces filtres.', 'empty')); return; }
  const table = node('table'); table.append(node('caption', 'Événements techniques réels'));
  const head = node('thead'), row = node('tr');
  for (const text of ['Heure', 'Niveau', 'Événement', 'Service', 'Réponse']) { const th = node('th', text); th.scope = 'col'; row.append(th); }
  head.append(row); table.append(head);
  const body = node('tbody');
  for (const event of shown) {
    const tr = node('tr'); const time = node('td', date(event.time));
    const level = node('td'); level.append(node('span', levelLabels[event.level] || 'Inconnu', `badge ${Object.hasOwn(levelLabels, event.level) ? event.level : ''}`));
    const detail = node('td'); detail.append(node('strong', event.code), node('code', `${event.method} ${event.route}`), node('code', event.reference));
    tr.append(time, level, detail, node('td', labels[event.service] || event.service), node('td', `HTTP ${event.status} · ${number(event.duration_ms)} ms`)); body.append(tr);
  }
  table.append(body); $('log-results').replaceChildren(table);
}
async function refresh() {
  if (busy || !csrf) return;
  workflows.refreshCounts();
  const tab = location.hash.slice(1).split('?')[0];
  if (['moderation','messages'].includes(tab)) { await workflows.refresh(tab); return; }
  busy = true; $('refresh').disabled = true;
  const current = generation;
  try {
    const [overview, logs] = await Promise.all([api('overview'), api('logs')]);
    if (current !== generation || !csrf) return;
    renderOverview(overview); events = logs.events; renderLogs();
    $('updated').textContent = `Actualisé le ${date(overview.generated_at)} · actualisation manuelle`;
    notice('');
  } catch (error) {
    if (csrf) $('updated').textContent = 'Données potentiellement périmées — actualisation échouée';
    notice(error.message || 'Serveur inaccessible. Réessayez.', true);
  } finally { busy = false; $('refresh').disabled = false; }
}
const workflows = setupWorkflows(api, () => Boolean(csrf));
const contactOption = node('option', 'Contact'); contactOption.value = 'contact'; $('service').append(contactOption);
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if ($('login-button').disabled) return;
  $('login-button').disabled = true;
  const password = $('password').value; $('password').value = '';
  try { loggedIn(await api('login', { method: 'POST', body: JSON.stringify({ username: $('username').value.trim(), password }) })); await refresh(); }
  catch (error) { notice(error.message || 'Connexion impossible.', true); }
  finally { $('login-button').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  if (!workflows.canLeave()) return;
  $('logout').disabled = true;
  try { await api('logout', { method: 'POST' }); lock('Déconnexion effectuée.'); }
  catch (error) { notice(`${error.message} La révocation de session n’a pas pu être confirmée.`, true); }
  finally { $('logout').disabled = false; }
});
$('refresh').addEventListener('click', refresh);
for (const id of ['search', 'level', 'service']) $(id).addEventListener('input', renderLogs);
$('clear').addEventListener('click', () => { for (const id of ['search', 'level', 'service']) $(id).value = ''; renderLogs(); });
window.addEventListener('hashchange', () => navigate(true));
window.addEventListener('pagehide', () => lock());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
if (document.body.dataset.backend !== 'true' || location.protocol !== 'https:') {
  $('connection').textContent = 'Connexion indisponible';
  notice('Ouvrez cette page depuis l’adresse HTTPS du backend, suivie de /admin/. Ne saisissez aucun secret sur un aperçu statique.', true);
} else {
  try { loggedIn(await api('session')); await refresh(); }
  catch (error) {
    if (error.code === 'ADMIN_SESSION_EXPIRED') lock();
    else { $('connection').textContent = 'Accès indisponible'; notice(error.message, true); }
  }
}
