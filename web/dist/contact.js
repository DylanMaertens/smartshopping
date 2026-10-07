const brand = window.SITE_CONFIG?.name || 'SmartShopping';
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
