export function speechErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'E_PERMISSION': return 'Autorise le microphone dans les réglages de l’application pour dicter.';
    case 'E_LANGUAGE': return 'Le français n’est pas disponible dans le moteur local. Vérifie les langues hors ligne du service vocal Android dans les réglages du téléphone.';
    case 'E_UNAVAILABLE': return 'Reconnaissance locale indisponible. Android 12 minimum et un moteur vocal local compatible sont nécessaires.';
    case 'E_NO_SPEECH': return 'Aucune parole reconnue. Rapproche le téléphone et réessaie dans un endroit calme.';
    case 'E_TIMEOUT': return 'La dictée a pris trop de temps. Réessaie avec une phrase plus courte.';
    case 'E_BUSY': return 'Le microphone ou le moteur vocal est occupé. Réessaie dans quelques instants.';
    case 'E_CANCELLED': return 'Dictée interrompue. Tu peux recommencer quand tu es prêt.';
    default: return 'La reconnaissance locale a échoué. Réessaie ou utilise la saisie manuelle. Aucun service en ligne ne sera utilisé.';
  }
}
