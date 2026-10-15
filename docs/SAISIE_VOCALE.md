# Saisie vocale Android — locale uniquement

L’APK 0.1.12 (code Android 13), produit le 11 octobre 2026, intègre le module local
`mobile/modules/poduna-speech` et la permission microphone vérifiés dans le fichier
signé. L’APK 0.1.11 ne contient pas ce module. Le script habituel de construction
lance le prebuild qui actualise aussi la permission microphone du manifeste Android.

## Contrat de confidentialité et compatibilité

- Android 12 (API 31) minimum pour **cette fonction**, sans relever le minimum de l'application.
- Détection de `isOnDeviceRecognitionAvailable`, puis création exclusivement avec
  `createOnDeviceSpeechRecognizer`. Jamais le moteur par défaut, ni une API distante.
- Français `fr-FR` pour cette première version. Un moteur et un modèle de langue
  locaux compatibles doivent être disponibles. Android récent ne suffit pas à lui seul.
- Permission `RECORD_AUDIO` demandée uniquement après « Commencer la dictée ».
- Aucun téléchargement automatique de modèle, aucune conservation d'audio par Poduna,
  aucun log de transcription. La transcription reste un brouillon en mémoire jusqu'à
  validation. Les articles validés suivent le stockage et le partage habituels de la liste.
- Annulation à la fermeture, à la sortie de l'application et à la destruction du module.
  Délai maximal de 45 secondes ; destruction du moteur après résultat ou erreur.
- Pas de bascule en ligne si indisponible : explication et retour à la saisie manuelle.
- Les aperçus web et iOS n'utilisent pas de reconnaissance navigateur ou de service externe.

## Parcours

Évolution incluse dans l’APK 0.1.13 : un seul écran
« Ajouter un article » avec Produit / Scanner / Dicter. Scanner propose un sélecteur
Code-barres / Liste écrite, aux commandes exclusives. Retour depuis un mode revient
au formulaire sans fermer la fenêtre ; un second retour ferme l’ajout. Les brouillons
manuel, OCR et vocal sont conservés pendant les changements de mode de cette session.
Quitter la dictée annule l’écoute et ignore sa réponse tardive ; quitter la caméra
la démonte et ignore une photo encore en capture. Un OCR déjà envoyé peut finir en
arrière-plan de cet écran, mais ne crée jamais d’article sans validation.

Ajouter un article → Dicter → Commencer la dictée → autorisation microphone →
phrase courte → arrêt automatique ou Terminer la dictée → texte entendu et articles
modifiables → Ajouter les articles à la liste.

Exemple : « deux oranges, puis du lait, puis trois yaourts ».
Dire « puis » est la séparation recommandée. Le parseur propose les quantités
simples, conserve les poids dans les noms et réutilise les validations existantes
(50 lignes maximum, quantités 1 à 999, singulier, doublons et rayons mémorisés).
La séparation naturelle reste imparfaite : noms composés, nombres complexes,
marques et unités doivent être relus. Aucune correction silencieuse par un service IA.
Une nouvelle dictée réussie remplace le brouillon ; en cas d'erreur, il est conservé.

## Corrections de dictée — incluses dans l’APK 0.1.15

Le bouton « Retour à l’ajout manuel » est désormais dans un pied fixe, séparé du
contenu défilant et de ses changements de hauteur. La dictée utilise une seule zone
de défilement à hauteur bornée, y compris hors du panneau d’ajout intégré.
Cette modification cible le clignotement signalé en bas de page sur Android ;
le mécanisme natif exact n’a pas été reproduit et la disparition sur téléphone reste
à confirmer dans cet APK, notamment après dictée, corrections et clavier.

Après transcription, des suggestions locales sont affichées dans la relecture.
Elles réutilisent le vocabulaire de correction des photos, mais toutes restent
incertaines : les scores de ressemblance de caractères ne mesurent pas la confiance
du moteur vocal. Chaque remplacement demande une action explicite ; il est possible
de conserver le texte, masquer les suggestions et annuler la dernière correction.
Les noms déjà présents dans la liste sont protégés comme pour l’OCR.

Pas de règle spéciale `1 → Pain` : cette confusion occasionnelle n’est pas suffisante
pour déduire le produit voulu. Les chiffres restent à relire et modifier manuellement.
Le correcteur rapproche l’orthographe des mots, mais ne peut pas résoudre toutes les
confusions phonétiques, notamment un mot remplacé par un chiffre ou un autre mot valide.
Une saisie manuelle efface l’annulation précédente ; une nouvelle dictée réussie
réinitialise les choix de correction, tandis qu’un échec conserve le brouillon.
Les corrections sont bloquées pendant l’écoute. Aucun service ni audio envoyé en ligne.

À essayer sur téléphone avec la 0.1.15 : accepter/refuser une suggestion,
annuler une correction, conserver une vraie quantité et recommencer après correction.

## Retour via Produit — correctif après 0.1.15, non encore compilé

Produit ouvre automatiquement le clavier. Les fenêtres Android natives sont déjà
en `adjustResize` ; `PageModal` ajoutait un `KeyboardAvoidingView` en mode `height`,
avec une hauteur initiale mémorisée. Ce double ajustement est supprimé sur Android :
une vue flexible suit désormais la taille de la fenêtre native. L’évitement clavier
par padding reste actif sur iOS. Le pied de dictée ne grandit ni ne rétrécit avec le
contenu ; il conserve toutefois sa hauteur naturelle pour l’accessibilité du texte.

Vérifier sur téléphone, plusieurs fois : Dictée → Produit → Dictée, puis Dictée →
Produit → Scanner → Dictée. Comparer avec Dictée → Scanner → Dictée. Le bouton du bas
doit garder la même hauteur et les deux brouillons doivent rester conservés.
Tester aussi l’éditeur vocal et l’ajout manuel avec le clavier affiché.
Les tests navigateur réduisent puis restaurent la hauteur disponible ; ils ne
reproduisent pas le clavier natif. Confirmation Android encore nécessaire.

## Vérifications initiales sur téléphone avec l’APK 0.1.13

1. Moteur et français installés : tester en mode avion « deux oranges puis du lait ».
2. Refuser le microphone : aucune écoute, retour manuel disponible.
3. Accepter le microphone, fermer ou mettre l'app en arrière-plan pendant l'écoute :
   indicateur micro éteint ; aucune apparition tardive ni ajout d'article.
4. Arrêter une dictée, relire, modifier puis valider ; aucun ajout avant validation.
5. Français absent / moteur local absent / Android < 12 : message, sans accès à un moteur distant.
6. Silence, bruit, app concurrente utilisant le micro, nouvelle tentative, poids et marques.
7. Vérifier les rayons mémorisés, quantités regroupées et absence de synchronisation d'une liste locale.

La compilation Kotlin et les tests automatisés ne valident pas la qualité acoustique
ni la disponibilité des moteurs sur les téléphones des testeurs.

Références : [API Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer),
[modules locaux Expo](https://docs.expo.dev/modules/get-started/).
