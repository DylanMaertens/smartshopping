const $ = id => document.getElementById(id);
let pending = null, sending = false;
const errors = { CONTACT_DISABLED: 'Le service de contact n’est pas ouvert sur ce serveur.', CONTACT_THROTTLED: 'Limite d’envoi atteinte. Réessayez dans une heure.', CONTACT_INVALID: 'Vérifiez votre adresse et votre message (20 à 3 000 caractères).', CONTACT_CONFLICT: 'La référence correspond déjà à un autre message. Rechargez la page.', CONTACT_ORIGIN_REJECTED: 'Ouvrez le lien HTTPS fourni pour ce test.', WORKFLOW_UNAVAILABLE: 'La base est indisponible. Aucun envoi confirmé.' };
async function request(path, data) {
  let response;
  try { response = await fetch(`/api/v1/contact${path}`, { method: data ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'X-Poduna-Contact': '1', ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }); }
  catch { throw new Error('Connexion interrompue ou délai dépassé. Réception non confirmée : réessayez sans modifier le message pour éviter un doublon.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errors[result.code] || `Service indisponible (HTTP ${response.status}).`);
  return result;
}
$('contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = { email: $('email').value.trim(), topic: $('topic').value, body: $('message').value.trim(), website: $('website').value };
  if (data.body.length < 20) { $('contact-status').textContent = errors.CONTACT_INVALID; return; }
  // Preserve the id for exact retries after a lost response; never store PII in browser storage.
  if (!pending || ['email','topic','body','website'].some(key => pending[key] !== data[key])) pending = { id: crypto.randomUUID(), ...data };
  $('summary').textContent = `${data.email}\n${$('topic').selectedOptions[0].textContent}\n\n${data.body}`;
  $('send-status').textContent = ''; $('send-status').className = ''; $('confirm').showModal(); $('cancel').focus();
});
$('cancel').addEventListener('click', () => { if (!sending) $('confirm').close(); });
$('confirm').addEventListener('cancel', event => { if (sending) event.preventDefault(); });
$('send').addEventListener('click', async () => {
  if (sending || !pending) return;
  sending = true; $('send').disabled = true; $('cancel').disabled = true;
  $('send-status').textContent = 'Envoi en cours…';
  try {
    const result = await request('',pending);
    if (!result.received || result.reference !== pending.id) throw new Error('Réception non confirmée. Réessayez avec le même message.');
    $('contact-status').textContent = `Message reçu. Référence : ${result.reference}. Aucun e-mail n’a été envoyé.`;
    $('contact-status').classList.remove('error'); pending = null; $('contact-form').reset(); $('message-count').textContent = '0 / 3 000'; $('confirm').close();
  } catch (error) { $('send-status').className = 'error'; $('send-status').textContent = error.message || 'Réception non confirmée. Réessayez sans modifier le message pour éviter un doublon.'; }
  finally { sending = false; $('send').disabled = false; $('cancel').disabled = false; }
});
window.addEventListener('pagehide', () => { pending = null; $('contact-form').reset(); $('summary').textContent = ''; });
async function connect() {
  $('contact-retry').hidden = true; $('contact-fields').disabled = true;
  if (location.protocol !== 'https:') { $('contact-status').textContent = 'Utilisez le lien HTTPS fourni pour ce test.'; return; }
  try { await request('/status'); $('contact-fields').disabled = false; $('contact-status').classList.remove('error'); $('contact-status').textContent = 'Service de contact ouvert pour les tests. Aucun message envoyé sans confirmation.'; }
  catch (error) { $('contact-status').classList.add('error'); $('contact-status').textContent = error.message; $('contact-retry').hidden = false; }
}
$('contact-retry').addEventListener('click',connect);
$('message').addEventListener('input',() => { $('message-count').textContent = `${$('message').value.length.toLocaleString('fr-FR')} / 3 000`; });
window.addEventListener('beforeunload',event => { if (sending || ['email','message'].some(id => $(id).value)) { event.preventDefault(); event.returnValue = ''; } });
await connect();
