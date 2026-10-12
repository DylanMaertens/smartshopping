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

## Vérifications sur téléphone avec l’APK 0.1.13

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
