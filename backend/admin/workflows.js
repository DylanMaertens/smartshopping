export function setupWorkflows(api, authenticated) {
  const $ = id => document.getElementById(id);
  const node = (tag,text,cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  const labels = { pending:'À examiner', validated:'Validée par consensus', rejected:'Rejetée', revoked:'Retirée', upheld:'Confirmé', dismissed:'Écarté', new:'Nouveau', active:'En cours', closed:'Clos', name:'Nom', category:'Rayon', question:'Question', technical:'Problème technique', suggestion:'Suggestion', other:'Autre demande', wrong_product:'Mauvais produit', wrong_name:'Nom incorrect', wrong_category:'Rayon incorrect', abuse:'Abus', spam:'Spam', withdraw:'Retirer la proposition', dismiss:'Écarter le signalement', uphold:'Confirmer sans retirer', proposals:'Proposition', reports:'Signalement', messages:'Message' };
  const states = { proposals:['pending','validated','rejected','revoked'], reports:['pending','upheld','dismissed'], messages:['new','active','closed'] };
  const date = value => new Date(value).toLocaleString('fr-FR');
  const queues = { moderation:{ offset:0, seq:0 }, messages:{ offset:0, seq:0 } };
  let selected = null, detailSeq = 0, sending = false, countsSeq = 0;
  const countIds = {reports:'pending-reports',proposals:'pending-proposals',messages:'pending-messages',active_messages:'active-messages'};
  const dirty = () => Boolean(selected && ($('decision-reason').value.length || $('decision-action').value !== selected.initialAction));
  function canLeave() {
    if (sending) { $('dossier-notice').textContent = 'Décision en cours. Attendez la confirmation avant de quitter.'; return false; }
    return !dirty() || window.confirm('Abandonner la décision et le motif non enregistrés ?');
  }
  async function refreshCounts() {
    if (!authenticated()) return;
    const seq = ++countsSeq;
    $('counts-status').textContent = 'Actualisation des compteurs…';
    try {
      const data = await api('queue-counts');
      if (seq !== countsSeq || !authenticated()) return;
      for (const [key,id] of Object.entries(countIds)) $(id).textContent = Number(data[key]).toLocaleString('fr-FR');
      $('counts-status').className = 'small muted'; $('counts-status').textContent = `Compteurs globaux hors filtres · ${date(Date.now())}`;
    } catch (error) {
      if (seq !== countsSeq || !authenticated()) return;
      for (const id of Object.values(countIds)) $(id).textContent = '—';
      $('counts-status').className = 'small error'; $('counts-status').textContent = `Compteurs indisponibles. ${error.message}`;
    }
  }
  const kindFor = tab => tab === 'messages' ? 'messages' : $('moderation-kind').value;
  function options(select,values) { select.replaceChildren(...values.map(value => { const el = node('option',labels[value] || value); el.value = value; return el; })); }
  function reset() {
    countsSeq++; for (const id of Object.values(countIds)) $(id).textContent = '—'; $('counts-status').textContent = '';
    detailSeq++; selected = null; $('dossier').close(); $('dossier-content').replaceChildren(); $('dossier-history').replaceChildren(); $('decision-reason').value = ''; $('dossier-notice').textContent = '';
    for (const [tab,q] of Object.entries(queues)) { q.seq++; q.offset = 0; q.search = ''; $(`${tab}-search`).value = ''; $(`${tab}-results`).replaceChildren(); $(`${tab}-info`).textContent = ''; $(`${tab}-page`).textContent = ''; }
  }
  async function refresh(tab) {
    if (!queues[tab] || !authenticated()) return;
    const q = queues[tab], seq = ++q.seq, kind = kindFor(tab), offset = q.offset;
    $(`${tab}-info`).textContent = 'Chargement…'; $(`${tab}-results`).replaceChildren();
    $(`${tab}-previous`).disabled = true; $(`${tab}-next`).disabled = true;
    try {
      const result = await api(`queues/${kind}?status=${encodeURIComponent($(`${tab}-status`).value)}&offset=${offset}&search=${encodeURIComponent(q.search || '')}`);
      if (seq !== q.seq || !authenticated()) return;
      $(`${tab}-info`).textContent = tab === 'messages' ? (result.contact_enabled ? 'Contact ouvert pour les tests.' : 'Réception désactivée ; les messages existants restent consultables.') : (result.community_enabled ? 'Catalogue communautaire activé.' : 'Catalogue communautaire désactivé ; les dossiers existants restent consultables.');
      $(`${tab}-info`).className = '';
      $(`${tab}-page`).textContent = `Page ${offset / 50 + 1} · ${result.items.length} affiché(s) / ${result.total} résultat(s)`;
      $('updated').textContent = `Actualisé le ${date(Date.now())} · actualisation manuelle`;
      $(`${tab}-previous`).disabled = offset === 0; $(`${tab}-next`).disabled = !result.has_more;
      const cards = result.items.map(item => {
        const card = node('article',undefined,'card');
        card.append(node('h2',kind === 'messages' ? labels[item.topic] : item.value), node('p',kind === 'messages' ? item.email : `${item.barcode} · ${labels[item.field_name]}${kind === 'reports' ? ` · ${labels[item.reason]}` : ` · ${item.agrees} accord(s) actif(s), ${item.reports} signalement(s)`}`), node('p',`${labels[item.status]} · ${date(item.created_at)}`));
        const button = node('button','Examiner','secondary'); button.type = 'button'; button.addEventListener('click',() => open(tab,kind,item.id)); card.append(button); return card;
      });
      $(`${tab}-results`).replaceChildren(...(cards.length ? cards : [node('p','Aucun dossier dans cet état.','empty')]));
    } catch (error) { if (seq === q.seq && authenticated()) { $(`${tab}-info`).className = 'notice error'; $(`${tab}-info`).textContent = `${error.message} Utilisez Actualiser pour réessayer.`; $(`${tab}-page`).textContent = 'Résultats indisponibles'; } }
  }
  async function open(tab,kind,id) {
    const seq = ++detailSeq; selected = null;
    $('decision-form').hidden = true; $('decision-reason').value = ''; $('dossier-content').replaceChildren(); $('dossier-history').replaceChildren(); $('dossier-notice').textContent = 'Chargement…'; $('dossier-title').textContent = labels[kind]; $('dossier').showModal();
    try {
      const result = await api(`queues/${kind}/${id}`);
      if (seq !== detailSeq || !authenticated()) return;
      const item = result.item; selected = {tab,kind,item};
      $('dossier-notice').textContent = '';
      const lines = [['Référence',item.id],['État',labels[item.status]],['Reçu le',date(item.created_at)]];
      if (kind === 'messages') lines.push(['Adresse',item.email],['Sujet',labels[item.topic]],['Message',item.body]);
      else {
        lines.push(['Code-barres',item.barcode],['Champ',labels[item.field_name]],['Valeur',item.value]);
        if (kind === 'reports') lines.push(['Motif du signalement',labels[item.reason]],['Proposition liée',`${item.proposal_id} · ${labels[item.proposal_status]}`]);
        else lines.push(['Accords actifs (pas le dénominateur du consensus)',String(item.agrees)],['Signalements en attente',String(item.reports)]);
      }
      const dl = node('dl'); for (const [key,value] of lines) { const row = node('div'); row.append(node('dt',key),node('dd',value,'message-body')); dl.append(row); } $('dossier-content').append(dl);
      if (kind !== 'messages') {
        $('dossier-content').append(node('h3','Propositions actives pour ce code-barres · 20 maximum'));
        for (const candidate of result.related || []) $('dossier-content').append(node('p',`${labels[candidate.field_name]} : ${candidate.value} · ${labels[candidate.status]} · ${candidate.agrees} accord(s) / ${candidate.total_voters} votant(s) distinct(s) sur ce champ`));
      }
      let actions = [];
      if (kind === 'messages') actions = states.messages.filter(value => value !== item.status);
      else if (kind === 'proposals' && ['pending','validated'].includes(item.status)) actions = ['withdraw'];
      else if (kind === 'reports' && item.status === 'pending') actions = ['dismiss','uphold',...(['pending','validated'].includes(item.proposal_status) ? ['withdraw'] : [])];
      options($('decision-action'),actions); selected.initialAction = $('decision-action').value; $('decision-form').hidden = !actions.length;
      $('dossier-history').replaceChildren(...(result.history.length ? result.history.map(event => node('p',`${date(event.created_at)} · ${event.actor} · ${labels[event.previous_status]} → ${labels[event.next_status]}\n${event.reason}`,'message-body')) : [node('p','Aucune décision administrative enregistrée.')]));
    } catch (error) { if (seq === detailSeq && authenticated()) $('dossier-notice').textContent = error.message; }
  }
  $('decision-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!selected || sending || !authenticated()) return;
    const reason = $('decision-reason').value.trim();
    if (reason.length < 10) { $('dossier-notice').textContent = 'Précisez le motif (au moins 10 caractères).'; return; }
    const {tab,kind,item} = selected, action = $('decision-action').value;
    const effect = action === 'withdraw' ? 'La proposition ne sera plus diffusée par le catalogue communautaire. Les copies déjà enregistrées sur les téléphones ne sont pas effacées.' : action === 'uphold' ? 'Le signalement sera confirmé, mais la proposition restera inchangée.' : 'Le nouvel état sera conservé dans la base. Aucun e-mail ni sanction automatique.';
    if (!window.confirm(`${labels[action]} — ${kind === 'messages' ? item.email : item.value}\n\n${effect}\n\nMotif : ${reason}`)) return;
    sending = true; $('decision-submit').disabled = true; $('dossier-close').disabled = true;
    const seq = detailSeq;
    try {
      await api(`queues/${kind}/${item.id}/decision`,{method:'POST',body:JSON.stringify({action,reason,version:item.version,status:item.status,proposal_version:item.proposal_version ?? null})});
      if (seq !== detailSeq || !authenticated()) return;
      $('dossier').close(); selected = null; $('decision-reason').value = ''; await Promise.all([refresh(tab),refreshCounts()]);
      if (authenticated()) $(`${tab}-info`).textContent += ' Décision enregistrée.';
    } catch (error) { if (seq === detailSeq && authenticated()) $('dossier-notice').textContent = `${error.message} En cas de doute, fermez et actualisez le dossier avant de réessayer.`; }
    finally { sending = false; $('decision-submit').disabled = false; $('dossier-close').disabled = false; }
  });
  $('dossier-close').addEventListener('click',() => { if (!canLeave()) return; detailSeq++; selected = null; $('decision-reason').value = ''; $('dossier').close(); });
  $('dossier').addEventListener('cancel',event => { if (!canLeave()) event.preventDefault(); else { detailSeq++; selected = null; $('decision-reason').value = ''; } });
  window.addEventListener('beforeunload',event => { if (authenticated() && (dirty() || sending)) { event.preventDefault(); event.returnValue = ''; } });
  for (const tab of Object.keys(queues)) {
    options($(`${tab}-status`),states[kindFor(tab)]);
    $(`${tab}-search-form`).addEventListener('submit',event => { event.preventDefault(); queues[tab].search = $(`${tab}-search`).value.trim(); queues[tab].offset = 0; refresh(tab); });
    $(`${tab}-clear`).addEventListener('click',() => { $(`${tab}-search`).value = ''; queues[tab].search = ''; queues[tab].offset = 0; refresh(tab); });
    $(`${tab}-status`).addEventListener('change',() => { queues[tab].offset = 0; refresh(tab); });
    for (const [suffix,delta] of [['previous',-50],['next',50]]) $(`${tab}-${suffix}`).addEventListener('click',() => { queues[tab].offset = Math.max(0,queues[tab].offset+delta); refresh(tab); });
  }
  $('moderation-kind').addEventListener('change',() => { queues.moderation.offset = 0; options($('moderation-status'),states[kindFor('moderation')]); refresh('moderation'); });
  for (const [key,id] of Object.entries(countIds)) $(id).closest('a').addEventListener('click',event => {
    event.preventDefault(); if (!canLeave()) return;
    const tab = key.includes('messages') ? 'messages' : 'moderation';
    if (tab === 'moderation') { $('moderation-kind').value = key; options($('moderation-status'),states[key]); }
    $(`${tab}-status`).value = key === 'active_messages' ? 'active' : tab === 'messages' ? 'new' : 'pending';
    queues[tab].offset = 0; queues[tab].search = ''; $(`${tab}-search`).value = '';
    if (location.hash === `#${tab}`) refresh(tab); else location.hash = tab;
  });
  return {reset,refresh,refreshCounts,canLeave};
}
