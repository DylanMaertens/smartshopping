// Synthetic examples only. Reserved .invalid addresses cannot be real recipients.
export const createMessages = () => [
  { id: 'DEMO-MSG-003', name: 'Camille · exemple', email: 'camille@example.invalid', subject: 'Retrouver mes listes après une mise à jour', topic: 'Question sur l’application', received: '7 octobre · 14:12', status: 'new', unread: true,
    body: 'Bonjour, je voudrais installer la nouvelle version de test. Dois-je désinstaller la précédente ? Je souhaite conserver mes listes de courses.',
    reply: '', history: [] },
  { id: 'DEMO-MSG-002', name: 'Alex · exemple', email: 'alex@example.invalid', subject: 'Une recherche produit ne répond pas', topic: 'Problème technique', received: '7 octobre · 11:40', status: 'active', unread: false,
    body: 'Bonjour, dans cet exemple, le scan lit bien le code-barres mais la recherche n’aboutit pas. Je peux encore ajouter un nom manuellement. Que faudrait-il vérifier ?',
    reply: '', history: [{ label: 'Pris en charge · exemple', body: 'Une vérification de l’adresse du serveur et du message d’erreur reste à préparer.' }] },
  { id: 'DEMO-MSG-001', name: 'Lou · exemple', email: 'lou@example.invalid', subject: 'Choisir le thème Origine', topic: 'Question sur l’application', received: '6 octobre · 16:05', status: 'closed', unread: false,
    body: 'Bonjour, où peut-on changer l’apparence de l’application ?', reply: '',
    history: [{ label: 'Réponse fictive · 7 octobre, 09:10', body: 'Bonjour, ouvrez Réglages, puis Apparence. Le thème Origine est disponible dans la version de test 0.1.8.' }, { label: 'Dossier traité · exemple', body: 'Cette conversation est entièrement fictive. Aucun e-mail n’a été envoyé.' }] }
];
