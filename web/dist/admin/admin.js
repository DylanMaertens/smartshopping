import { logs, createCases } from './demo-data.js';
import { initMessages } from './messages.js';
const titles = { supervision: 'Supervision', journaux: 'Journaux', moderation: 'Modération', messages: 'Messages' };
const brand = window.SITE_CONFIG?.name || 'SmartShopping';
document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = brand; });
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const levelNames = { info: 'Information', warning: 'Attention', error: 'Erreur' };
const services = { api: 'API', sync: 'Synchronisation', catalogues: 'Catalogues', community: 'Communauté', ocr: 'OCR' };
const statusNames = { pending: 'À examiner', upheld: 'Fondé', dismissed: 'Non fondé', withdrawn: 'Proposition retirée' };
let cases = createCases();
let selectedId = cases[0].id;
let pendingAction = null;
const renderMessages = initMessages();

$('logs-content').innerHTML = `<div class="card"><div class="filters">
  <label class="search" for="log-search">Rechercher un événement<input id="log-search" type="search" placeholder="Référence, route ou message" maxlength="200"></label>
  <label for="log-level">Niveau<select id="log-level"><option value="">Tous les niveaux</option><option value="error">Erreur</option><option value="warning">Attention</option><option value="info">Information</option></select></label>
  <label for="log-service">Service<select id="log-service"><option value="">Tous les services</option>${Object.entries(services).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
  <button type="button" id="clear-logs" class="secondary">Effacer les filtres</button></div>
  <div class="result-meta"><span id="log-count" role="status"></span><span>7 octobre 2026 · échantillon fictif</span></div>
  <div id="log-results"></div></div><p class="small muted">Routes anonymisées. Aucun secret, code d’invitation, contenu de liste ou photo dans ces exemples.</p>`;

function renderLogs() {
  const search = normalize($('log-search').value.trim());
  const rows = logs.filter(row => (!$('log-level').value || row.level === $('log-level').value)
    && (!$('log-service').value || row.service === $('log-service').value)
    && normalize(`${row.reference} ${row.route} ${row.message}`).includes(search));
  $('log-count').textContent = `${rows.length} événement(s) sur ${logs.length} exemples`;
  $('log-results').innerHTML = rows.length ? `<div class="table-wrap"><table><caption class="sr-only">Événements techniques fictifs</caption><thead><tr><th scope="col">Heure</th><th scope="col">Niveau</th><th scope="col">Événement</th><th scope="col">Service</th><th scope="col">Réponse</th></tr></thead><tbody>${rows.map(row => `<tr class="log-row"><td data-label="Heure">${row.time}</td><td><span class="badge ${row.level === 'info' ? 'neutral' : row.level}">${levelNames[row.level]}</span></td><td><strong>${escape(row.message)}</strong><code>${escape(row.reference)}</code><details><summary>Détails de l’événement</summary><p>${escape(row.detail)}</p><code>${escape(row.route)}</code></details></td><td data-label="Service">${services[row.service]}</td><td data-label="Réponse">HTTP ${row.status}<br>${row.duration.toLocaleString('fr-FR')} ms</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Aucun événement ne correspond à ces filtres.</p>';
}
['log-search', 'log-level', 'log-service'].forEach(id => $(id).addEventListener('input', renderLogs));
$('clear-logs').addEventListener('click', () => { ['log-search', 'log-level', 'log-service'].forEach(id => { $(id).value = ''; }); renderLogs(); $('log-search').focus(); });

$('moderation-content').innerHTML = `<div class="filters"><label class="search" for="case-search">Rechercher un dossier<input id="case-search" type="search" placeholder="Produit, code-barres fictif ou référence" maxlength="200"></label><label for="case-status">État<select id="case-status"><option value="pending">À examiner</option><option value="all">Tous les dossiers</option><option value="reviewed">Traités</option></select></label><button type="button" id="reset-demo" class="secondary">Réinitialiser la démonstration</button></div><div class="result-meta"><span id="case-count" role="status"></span><span>Aucune sanction automatique</span></div><div class="moderation-grid"><div id="case-list" class="queue" aria-label="Dossiers de modération"></div><article id="case-detail" class="card detail" aria-label="Détail du dossier"></article></div>`;

function renderCases(focusDetail = false) {
  const search = normalize($('case-search').value.trim());
  const filter = $('case-status').value;
  const shown = cases.filter(entry => (filter === 'all' || (filter === 'pending' ? entry.status === 'pending' : entry.status !== 'pending'))
    && normalize(`${entry.product} ${entry.barcode} ${entry.id}`).includes(search));
  if (!shown.some(entry => entry.id === selectedId)) selectedId = shown[0]?.id;
  $('case-count').textContent = `${shown.length} dossier(s) affiché(s) · ${cases.filter(entry => entry.status === 'pending').length} à examiner`;
  $('pending-total').textContent = String(cases.filter(entry => entry.status === 'pending').length);
  $('case-list').innerHTML = shown.length ? shown.map(entry => `<button type="button" class="case" data-case="${entry.id}" aria-pressed="${entry.id === selectedId}"><span class="case-top"><code>${entry.id}</code><span class="badge ${entry.status === 'pending' ? 'warning' : 'neutral'}">${statusNames[entry.status]}</span></span><strong>${escape(entry.product)}</strong><span>${entry.reason}</span><small>${entry.count} signalement(s) · ${entry.received}</small></button>`).join('') : '<p class="empty">Aucun dossier ne correspond à ces filtres.</p>';
  document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.case; renderCases(true); }));
  const entry = cases.find(item => item.id === selectedId);
  if (!entry) { $('case-detail').innerHTML = '<h2>Aucun dossier sélectionné</h2><p class="muted">Modifiez les filtres pour retrouver les autres exemples.</p>'; return; }
  $('case-detail').innerHTML = `<div class="card-heading"><p class="eyebrow">${entry.id}</p><span class="badge ${entry.status === 'pending' ? 'warning' : 'neutral'}">${statusNames[entry.status]}</span></div><h2 id="case-title" tabindex="-1">${escape(entry.product)}</h2><dl class="details-grid"><div><dt>Code-barres fictif</dt><dd><code>${entry.barcode}</code></dd></div><div><dt>Motif du signalement</dt><dd>${entry.reason}</dd></div><div><dt>Champ concerné</dt><dd>${entry.field}</dd></div><div><dt>État de la proposition</dt><dd>${entry.proposalStatus}</dd></div></dl><div class="proposal"><p class="small muted">Valeur proposée</p><p><strong>${escape(entry.value)}</strong></p><p class="small">Autre proposition : ${escape(entry.alternate)}</p></div><p class="small muted">${entry.votes}. Le consensus n’est pas une preuve de véracité. Plusieurs installations peuvent appartenir à une même personne.</p>
    ${entry.status === 'pending' ? `<form id="decision-form" class="decision-form"><h3>Décision de démonstration</h3><label for="decision">Action<select id="decision" required><option value="">Choisir une décision</option><option value="dismissed">Classer le signalement comme non fondé</option><option value="upheld">Confirmer le signalement sans retirer la proposition</option><option value="withdrawn">Confirmer le signalement et retirer la proposition</option></select></label><label for="decision-note">Motif de la décision<textarea id="decision-note" required minlength="10" maxlength="500" placeholder="Expliquez la décision sur ce dossier fictif (10 caractères minimum)."></textarea></label><p class="decision-note">Aucune restriction de contributeur n’est appliquée. Le nombre de signalements ne suffit pas à sanctionner.</p><button type="submit">Prévisualiser la décision</button></form>` : '<p class="proposal">Dossier traité dans la démonstration. Réinitialisez les exemples pour rejouer ce parcours.</p>'}
    <h3>Historique du dossier</h3><ol class="timeline"><li><strong>${entry.received} · Signalement reçu</strong><p>Exemple fictif, aucune identité d’appareil réelle.</p></li>${entry.history.map(event => `<li><strong>${escape(event.when)} · ${escape(event.action)}</strong><p>${escape(event.note)}</p><p class="muted">${escape(event.operator)}</p></li>`).join('')}</ol>`;
  if (focusDetail) $('case-title').focus();
  const form = $('decision-form');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    const note = $('decision-note').value.trim();
    if (note.length < 10) { $('decision-note').setCustomValidity('Écrivez un motif d’au moins 10 caractères.'); $('decision-note').reportValidity(); return; }
    pendingAction = { id: entry.id, status: $('decision').value, note };
    $('confirm-summary').textContent = `${entry.id} · ${entry.product} — ${statusNames[pendingAction.status]}. Motif : ${note}`;
    $('confirm-decision').showModal(); $('cancel-decision').focus();
  });
  $('decision-note')?.addEventListener('input', () => $('decision-note').setCustomValidity(''));
}
['case-search', 'case-status'].forEach(id => $(id).addEventListener('input', () => renderCases()));
$('reset-demo').addEventListener('click', () => { cases = createCases(); selectedId = cases[0].id; $('case-search').value = ''; $('case-status').value = 'pending'; renderCases(); $('announcement').textContent = 'Démonstration réinitialisée. Trois dossiers à examiner.'; });
$('cancel-decision').addEventListener('click', () => { pendingAction = null; $('confirm-decision').close(); });
$('confirm-decision').addEventListener('cancel', () => { pendingAction = null; });
$('apply-decision').addEventListener('click', () => {
  if (!pendingAction) return;
  const action = pendingAction; pendingAction = null;
  const entry = cases.find(item => item.id === action.id);
  if (entry?.status === 'pending') {
    entry.status = action.status;
    if (action.status === 'withdrawn') entry.proposalStatus = 'Retirée dans la simulation';
    entry.history.push({ when: 'À l’instant', action: statusNames[action.status], note: action.note, operator: 'Modérateur de démonstration' });
  }
  $('confirm-decision').close();
  $('case-status').value = 'all'; renderCases(true);
  $('announcement').textContent = `Décision simulée pour ${action.id}. Rien n’a été envoyé au serveur.`;
});

function navigate(focus = false) {
  const [requested, query = ''] = location.hash.slice(1).split('?');
  if (requested === 'contenu') { $('contenu').focus(); return; }
  const page = Object.hasOwn(titles, requested) ? requested : 'supervision';
  document.querySelectorAll('[data-page]').forEach(el => { el.hidden = el.dataset.page !== page; });
  document.querySelectorAll('nav a').forEach(el => {
    if (el.hash === `#${page}`) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  document.getElementById('breadcrumb').textContent = titles[page];
  document.title = `${titles[page]} · ${brand} Admin — maquette`;
  if (page === 'journaux') {
    const params = new URLSearchParams(query);
    $('log-search').value = params.get('search') || '';
    $('log-level').value = Object.hasOwn(levelNames, params.get('level')) ? params.get('level') : '';
    $('log-service').value = ''; renderLogs();
  }
  if (page === 'moderation') renderCases();
  if (page === 'messages') renderMessages();
  if (focus) { $('contenu').focus(); window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', () => navigate(true));
renderLogs(); renderCases();
navigate();
