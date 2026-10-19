export function setupSecurity(api, authenticated) {
  const $ = id => document.getElementById(id);
  const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const date = value => new Date(value).toLocaleString('fr-FR');
  let epoch = 0, busy = false, saving = false, selected = null, enforced = false;
  function message(text) { $('security-status').textContent = text; }
  function reset() {
    epoch++; selected = null; enforced = false;
    $('security-form').hidden = true; $('security-reason').value = '';
    for (const id of ['access-events', 'security-blocks', 'security-history']) $(id).replaceChildren();
    message('');
  }
  async function select(device) {
    if (saving) return;
    const current = ++epoch;
    selected = null; $('security-form').hidden = true;
    try {
      const data = await api(`security/devices/${encodeURIComponent(device)}`);
      if (current !== epoch || !authenticated()) return;
      selected = { device, version: data.block?.version ?? null };
      $('security-device').textContent = device;
      $('security-current').textContent = data.block?.expires_at > Date.now()
        ? `Bloqué jusqu’au ${date(data.block.expires_at)}` : 'Aucun blocage actif';
      $('security-minutes').value = data.block?.expires_at > Date.now() ? '0' : '15';
      $('security-reason').value = ''; $('security-form').hidden = false;
      $('security-minutes').focus();
    } catch (error) { if (current === epoch && authenticated()) message(error.message); }
  }
  function deviceButton(device) {
    const button = node('button', device); button.type = 'button'; button.className = 'secondary';
    button.disabled = !enforced; button.setAttribute('aria-label', `Gérer l’accès de l’appareil ${device}`);
    button.addEventListener('click', () => select(device)); return button;
  }
  async function refresh() {
    if (busy || !authenticated()) return;
    busy = true; const current = epoch;
    try {
      const data = await api('security');
      if (current !== epoch || !authenticated()) return;
      enforced = data.enforced;
      message(`Actualisé le ${date(Date.now())} · actualisation manuelle. ${data.dropped_since_start} événement(s) non persisté(s) depuis le démarrage (surcharge ou erreur).${enforced ? '' : ' Signatures désactivées : blocage indisponible.'}`);
      const table = node('table'); table.append(node('caption', '200 derniers accès conservés (hors sondes de santé)'));
      const header = node('tr'); for (const title of ['Heure', 'Service et accès', 'Résultat', 'Appareil vérifié']) { const th = node('th', title); th.scope = 'col'; header.append(th); }
      const head = node('thead'); head.append(header); table.append(head); const body = node('tbody');
      for (const event of data.events) {
        const row = node('tr'), route = node('td'), device = node('td');
        route.append(node('strong', event.service), node('code', `${event.method} ${event.route}`), node('code', event.reference));
        device.append(event.device_id ? deviceButton(event.device_id) : node('span', 'Non attribué (public, admin ou signature absente/invalide)'));
        row.append(node('td', date(event.created_at)), route, node('td', `${event.status} · ${event.code}`), device); body.append(row);
        [...row.children].forEach((cell, i) => { cell.dataset.label = ['Heure', 'Accès', 'Résultat', 'Appareil'][i]; });
      }
      table.append(body); $('access-events').replaceChildren(data.events.length ? table : node('p', 'Aucun accès conservé.'));
      const blocks = data.blocks.map(block => { const item = node('article'); item.className = 'card'; item.append(deviceButton(block.device_id), node('p', `Jusqu’au ${date(block.expires_at)}`), node('p', block.reason)); return item; });
      $('security-blocks').replaceChildren(node('p', `${data.blocks.length} blocage(s) affiché(s) sur ${data.block_count} actif(s).`), ...blocks);
      $('security-history').replaceChildren(...data.history.map(item => {
        const p = node('p', `${date(item.created_at)} · ${item.actor} · ${item.device_id} · ${item.expires_at ? `Blocage jusqu’au ${date(item.expires_at)}` : 'Déblocage'} · ${item.reason}`); return p;
      }));
    } catch (error) { if (current === epoch && authenticated()) { message(`Données indisponibles ou périmées : ${error.message}`); enforced = false; $('security-form').hidden = true; $('access-events').replaceChildren(); $('security-blocks').replaceChildren(); $('security-history').replaceChildren(); } }
    finally { busy = false; }
  }
  $('security-cancel').addEventListener('click', () => { if (saving) return; selected = null; epoch++; $('security-form').hidden = true; $('security-reason').value = ''; });
  $('security-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected || !enforced || $('security-submit').disabled) return;
    const minutes = Number($('security-minutes').value), reason = $('security-reason').value.trim();
    const target = selected, current = epoch;
    if (!confirm(`${minutes ? `Bloquer pendant ${minutes} minutes` : 'Débloquer'} l’appareil ${target.device} ?\n${reason}\nLes données locales ne seront pas supprimées.`)) return;
    saving = true; $('security-submit').disabled = true; $('security-cancel').disabled = true;
    try {
      await api('security/decisions', { method: 'POST', body: JSON.stringify({ device_id: target.device, expected_version: target.version, minutes, reason }) });
      if (current !== epoch || !authenticated()) return;
      selected = null; $('security-form').hidden = true; $('security-reason').value = '';
      await refresh();
    } catch (error) {
      if (current === epoch && authenticated()) {
        // A lost response may follow a successful commit. Force a fresh version,
        // never repeat a potentially stale decision automatically.
        selected = null; $('security-form').hidden = true;
        message(`${error.message} Actualisez puis sélectionnez à nouveau l’appareil pour vérifier son état.`);
      }
    } finally { saving = false; $('security-submit').disabled = false; $('security-cancel').disabled = false; }
  });
  return { refresh, reset };
}
