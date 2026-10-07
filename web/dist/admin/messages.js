import { createMessages } from './message-data.js';

export function initMessages() {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const statuses = { new: 'Nouveau', active: 'En cours', closed: 'Traité' };
  let messages = createMessages();
  let selectedId = messages[0].id;
  $('messages-content').innerHTML = `<div class="filters"><label class="search" for="message-search">Rechercher un message<input id="message-search" type="search" maxlength="200" placeholder="Objet, expéditeur ou référence"></label><label for="message-filter">Afficher<select id="message-filter"><option value="all">Tous les messages</option><option value="unread">Non lus</option><option value="new">Nouveaux</option><option value="active">En cours</option><option value="closed">Traités</option></select></label><button type="button" id="reset-messages" class="secondary">Réinitialiser les messages</button></div><div class="result-meta"><span id="message-count" role="status"></span><span>Aucun e-mail entrant ou sortant</span></div><div class="moderation-grid messages-grid"><div class="queue" id="message-list" aria-label="Messages fictifs"></div><article class="card detail" id="message-detail" aria-label="Conversation sélectionnée"></article></div>`;

  function shownMessages() {
    const search = normalize($('message-search').value.trim());
    const filter = $('message-filter').value;
    return messages.filter(entry => (filter === 'all' || (filter === 'unread' ? entry.unread : entry.status === filter))
      && normalize(`${entry.id} ${entry.name} ${entry.email} ${entry.subject}`).includes(search));
  }

  function renderList() {
    const shown = shownMessages();
    $('message-count').textContent = `${shown.length} message(s) affiché(s) · ${messages.filter(entry => entry.unread).length} non lu(s)`;
    $('message-list').innerHTML = shown.length ? shown.map(entry => `<button type="button" class="case message-case" data-message="${entry.id}" aria-pressed="${entry.id === selectedId}"><span class="case-top"><code>${entry.id}</code><span class="badge ${entry.status === 'closed' ? 'neutral' : 'warning'}">${statuses[entry.status]}</span></span><strong>${escape(entry.subject)}</strong><span>${escape(entry.name)}</span><small>${entry.received}${entry.unread ? ' · Non lu' : ' · Lu'}${entry.reply ? ' · Brouillon' : ''}</small></button>`).join('') : '<p class="empty">Aucun message ne correspond à ces filtres.</p>';
    document.querySelectorAll('[data-message]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.message; render(true); }));
  }

  function render(focusDetail = false) {
    const shown = shownMessages();
    if (!shown.some(entry => entry.id === selectedId)) selectedId = shown[0]?.id;
    renderList();
    const entry = messages.find(message => message.id === selectedId);
    if (!entry) { $('message-detail').innerHTML = '<h2>Aucun message sélectionné</h2><p class="muted">Modifiez les filtres pour retrouver les conversations fictives.</p>'; return; }
    $('message-detail').innerHTML = `<div class="card-heading"><p class="eyebrow">${entry.id}</p><span class="badge neutral">${statuses[entry.status]}</span></div><h2 id="message-title" tabindex="-1">${escape(entry.subject)}</h2><dl class="details-grid"><div><dt>Expéditeur fictif</dt><dd>${escape(entry.name)}<br><span class="small">${escape(entry.email)}</span></dd></div><div><dt>Sujet</dt><dd>${entry.topic}</dd></div></dl><div class="message-tools"><label for="message-state">État du dossier<select id="message-state">${Object.entries(statuses).map(([value, label]) => `<option value="${value}" ${entry.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" id="toggle-read" class="secondary">${entry.unread ? 'Marquer comme lu' : 'Marquer comme non lu'}</button></div><h3>Conversation</h3><div class="message-bubble"><p class="small muted">${entry.received} · Message fictif</p><p class="message-body">${escape(entry.body)}</p></div>${entry.history.map(event => `<div class="message-bubble reply-bubble"><p class="small muted">${escape(event.label)}</p><p class="message-body">${escape(event.body)}</p></div>`).join('')}<form id="reply-form" class="decision-form"><h3>Préparer une réponse</h3><label for="reply-body">Brouillon de réponse<textarea id="reply-body" required minlength="10" maxlength="3000" rows="6" placeholder="Rédigez une réponse pour cet exemple…" aria-describedby="draft-help draft-status">${escape(entry.reply)}</textarea></label><p id="draft-help" class="decision-note">Brouillon conservé uniquement dans cet onglet. Changer de dossier ne l’efface pas ; recharger la page l’efface. Aucun envoi possible.</p><p id="draft-status" class="small muted" role="status">${entry.reply ? 'Brouillon en mémoire dans cet onglet.' : 'Aucun brouillon.'}</p><button type="submit">Prévisualiser la réponse</button></form>`;
    if (focusDetail) $('message-title').focus();
    $('toggle-read').addEventListener('click', () => {
      entry.unread = !entry.unread; render();
      $('announcement').textContent = `${entry.id} marqué comme ${entry.unread ? 'non lu' : 'lu'} dans la démonstration.`;
      ($('toggle-read') || $('message-filter')).focus();
    });
    $('message-state').addEventListener('change', event => {
      const state = event.target.value;
      if (!Object.hasOwn(statuses, state)) return;
      entry.status = state;
      render(); $('announcement').textContent = `${entry.id} : ${statuses[state]}. État simulé, aucune réponse envoyée.`;
      ($('message-state') || $('message-filter')).focus();
    });
    $('reply-body').addEventListener('input', event => {
      entry.reply = event.target.value; event.target.setCustomValidity('');
      $('draft-status').textContent = entry.reply ? 'Brouillon en mémoire dans cet onglet.' : 'Aucun brouillon.';
      renderList();
    });
    $('reply-form').addEventListener('submit', event => {
      event.preventDefault();
      if (entry.reply.trim().length < 10) {
        $('reply-body').setCustomValidity('Écrivez au moins 10 caractères pour prévisualiser la réponse.'); $('reply-body').reportValidity(); return;
      }
      $('reply-recipient').textContent = `À : ${entry.email} · Objet : Re: ${entry.subject}`;
      $('reply-preview-body').textContent = entry.reply.trim();
      $('reply-preview').showModal(); $('close-reply').focus();
    });
  }
  ['message-search', 'message-filter'].forEach(id => $(id).addEventListener('input', () => render()));
  $('reset-messages').addEventListener('click', () => {
    if (messages.some(entry => entry.reply) && !window.confirm('Réinitialiser les exemples et effacer les brouillons de cet onglet ?')) return;
    messages = createMessages(); selectedId = messages[0].id;
    $('message-search').value = ''; $('message-filter').value = 'all'; render();
    $('announcement').textContent = 'Messages fictifs réinitialisés. Les brouillons ont été effacés.';
  });
  $('close-reply').addEventListener('click', () => $('reply-preview').close());
  return render;
}
