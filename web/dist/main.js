const config = window.SITE_CONFIG;
document.querySelectorAll('[data-brand]').forEach((node) => { node.textContent = config.name; });
document.querySelectorAll('[data-version]').forEach((node) => { node.textContent = config.version; });
document.title = `${config.name} — Les courses, l’esprit léger.`;
document.querySelector('.header .brand').setAttribute('aria-label', `${config.name}, accueil`);
const themeNames = { origine: 'Origine', minimal: 'Minimal', papier: 'Papier', nuit: 'Nuit' };
document.querySelectorAll('[data-theme]').forEach((button) => {
  button.addEventListener('click', () => {
    const theme = button.dataset.theme;
    if (!Object.hasOwn(themeNames, theme)) return;
    document.querySelectorAll('[data-theme]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
    const screen = document.getElementById('theme-screen');
    screen.src = `assets/app-${theme}.png`;
    screen.alt = `La liste de courses avec le thème ${themeNames[theme]} de l’application.`;
    document.getElementById('theme-status').textContent = `Aperçu du thème ${themeNames[theme]}${theme === 'origine' ? ' en développement' : ''}. Aussi disponibles dans l’app : Pastel, Pixel et Contraste.`;
  });
});
