const brand = window.SITE_CONFIG?.name || 'Poduna';
document.querySelectorAll('[data-brand]').forEach(node => { node.textContent = brand; });
document.title = `Contact · ${brand} — maquette`;
document.querySelector('.header .brand').setAttribute('aria-label', `${brand}, accueil`);
const email = document.getElementById('contact-email');
const topic = document.getElementById('contact-topic');
const message = document.getElementById('contact-message');
const preview = document.getElementById('contact-preview');
document.getElementById('contact-form').addEventListener('submit', event => {
  event.preventDefault();
  if (message.value.trim().length < 20) {
    message.setCustomValidity('Écrivez au moins 20 caractères, sans compter les espaces au début et à la fin.');
    message.reportValidity(); return;
  }
  document.getElementById('preview-email').textContent = email.value.trim();
  document.getElementById('preview-topic').textContent = topic.value;
  document.getElementById('preview-body').textContent = message.value.trim();
  preview.showModal(); document.getElementById('close-preview').focus();
});
message.addEventListener('input', () => {
  message.setCustomValidity('');
  document.getElementById('message-count').textContent = `${message.value.length.toLocaleString('fr-FR')} / 3 000`;
});
document.getElementById('close-preview').addEventListener('click', () => preview.close());
// Enable only after handlers are installed. No form action, network request or storage.
document.getElementById('contact-fields').disabled = false;
document.getElementById('contact-connect').addEventListener('submit', event => {
  event.preventDefault();
  const link = document.getElementById('contact-server-link'); link.hidden = true; link.removeAttribute('href');
  const status = document.getElementById('contact-connect-status');
  try {
    const url = new URL(document.getElementById('contact-server').value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/','/api/v1','/api/v1/','/contact.html'].includes(url.pathname)) throw new Error();
    link.href = `${url.origin}/contact.html`; link.textContent = `Ouvrir le contact sur ${url.host}`; link.hidden = false;
    status.textContent = 'Vérifiez que cette adresse est bien celle fournie pour le test. Le service doit avoir été ouvert par l’administrateur.';
  } catch { status.textContent = 'Adresse HTTPS invalide. Indiquez uniquement l’adresse du serveur, sans identifiants ni paramètres.'; }
});
