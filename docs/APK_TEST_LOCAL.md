# APK Android de test autonome

L’APK se construit sur le PC, sans compte Expo, sans EAS et sans publication en boutique. Il embarque l’interface : Expo Go et Metro ne sont plus nécessaires sur le téléphone. Le serveur reste nécessaire pour partager, synchroniser, reconnaître une liste écrite et rechercher un produit en ligne.

## Installer et essayer

Le fichier produit par le lanceur est `artifacts/android/poduna-0.1.21-preview.apk`. C’est une compilation release signée avec une clé locale conservée sur ce PC ; le canal applicatif est `preview`. Elle cible les téléphones ARM 64 bits et ARM 32 bits compatibles avec Android 7 ou plus récent. La dictée locale nécessite Android 12 minimum et un moteur vocal local compatible avec le français.

1. Copier l’APK sur le téléphone et l’ouvrir pour l’installer. Android peut demander d’autoriser cette source d’installation.
2. Ouvrir Poduna : les listes sont utilisables hors ligne immédiatement.
3. Pour activer les fonctions en ligne, démarrer `python3 ops/local-https.py` sur le PC.
4. Dans l’app : **Réglages → Serveur de test**, coller l’adresse HTTPS du tunnel puis **Connecter et redémarrer**. L’app vérifie la disponibilité et conserve l’adresse sur le téléphone. Ce réglage est limité à cet APK de test.
5. Faire la même opération sur le second téléphone, puis partager/rejoindre une liste.

Quand le tunnel redémarre, mettre sa nouvelle adresse dans ce réglage sur les deux appareils : aucune recompilation de l’APK n’est nécessaire. Le test de connexion n’envoie ni identité d’appareil ni contenu des listes. Il accepte uniquement HTTPS et conserve l’ancienne configuration si la vérification échoue. Changer l’adresse redémarre l’app pour que toutes les requêtes utilisent le même serveur.

Utiliser l’adresse du **même backend SmartShopping** : changer d’adresse de tunnel ne change pas la base ou les identités du serveur. Ne pas utiliser ce réglage pour passer arbitrairement entre différentes bases.

**Les données d’Expo Go ne sont pas transférées automatiquement.** Conserver Expo Go et sa sauvegarde. Restaurer une sauvegarde dans l’APK crée des copies indépendantes ; pour conserver une liste partagée, la rejoindre avec une invitation valide. Les deux applications ont des identités d’appareil différentes.

## Mise à jour 0.1.21 — Découpage des listes OCR

Version Android 22. Installer par-dessus la version actuelle sans désinstaller.
Les correctifs caméra et codes-barres sont conservés. Les mises à jour de
sécurité serveur nécessitent un déploiement séparé ; cet APK ne les installe pas.

[APK 0.1.21](../artifacts/android/poduna-0.1.21-preview.apk) compilé le
31 octobre : environ 50 Mio, signature identique à la 0.1.20, intégrité et
constructeurs ML Kit vérifiés. Callbacks de réinitialisation caméra présents
dans le DEX. Aucune installation sur téléphone ni mise à jour serveur effectuée.
SHA-256 : `1d1592db008c32b100d298d29eb4f79ba4740d38b5c6e52fb47dff725e3a7f03`.

À tester :

- `Pain / Lait - Œufs. Café` : quatre lignes avant validation.
- `Chou-fleur / Lait demi-écrémé / Huile 1/2 L` : trois articles, noms conservés.
- Annuler le découpage, modifier une ligne puis importer : respecter la relecture.
- Vérifier rapidement codes-barres, lampe après sortie/réouverture et listes conservées.

Les points, slashs, tirets espacés ou répétés, tirets longs, puces et autres
marqueurs explicites séparent désormais les articles avant l'écran de relecture.
Les traits d'union internes (chou-fleur, demi-écrémé), fractions, décimales,
plages numériques, unités composées et abréviations courantes sont préservés.
Le contenu entre parenthèses reste groupé. Un trait d'union simple collé reste
volontairement ambigu : `pain-lait` n'est pas séparé automatiquement.

Le découpage peut être annulé avec « Annuler la dernière correction ». Les
modifications manuelles ne sont jamais redécoupées à l'import, et rien n'est
ajouté sans confirmation. La limite de 50 articles et les quantités continuent
à être vérifiées. Cette préparation est réservée au résultat OCR : elle ne
change pas la dictée ni la saisie manuelle. Aucun changement du moteur serveur.

Validation du 31 octobre : TypeScript, 384 tests Vitest, 278 tests Jest et
43 tests de configuration réussis. Les tests couvrent la préparation,
la relecture, l'annulation, les quantités et l'absence de redécoupage à l'import.

## Mise à jour 0.1.20 — Réinitialisation de la session caméra

Retour utilisateur après installation : le problème du flash semble résolu.
Les vérifications après migration, le partage et la communauté semblent
également bons de son côté ; cela constitue un retour d'usage, pas une nouvelle
exécution exhaustive des scénarios natifs automatisés.

Retour utilisateur après la 0.1.19 : **le flash se réactive toujours** après
une sortie/réouverture. En revanche, **OCR, sauvegarde et restauration sont
confirmés fonctionnels**, ainsi que les codes-barres depuis la 0.1.18.

Le patch caméra réinitialise désormais la session au détachement de la vue
Android, pas seulement à sa destruction finale : lampe/flash éteints,
abonnement retiré, aperçu et analyseur libérés. Une réouverture repart avec
une session neuve ; une ancienne initialisation asynchrone ne peut plus se
lier à la caméra après la sortie. Le nettoyage ne délie que les use cases de
la vue concernée pour préserver une nouvelle caméra déjà ouverte.

Validation locale de cette révision : compilations Kotlin debug/release,
7 tests natifs (4 de session, 3 d'abonnement), 276 tests Jest, TypeScript et
4 fichiers de tests de configuration réussis. La 0.1.19 existante ne contient
pas cette révision. La 0.1.20 utilise le code Android 21.

[APK Poduna 0.1.20](../artifacts/android/poduna-0.1.20-preview.apk) compilé
le 21 octobre : ARM 32/64 bits, signature v2 vérifiée avec le même certificat
que la 0.1.19, trois constructeurs ML Kit présents. Le DEX embarque bien les
callbacks de détachement/réattachement et la remise à zéro de la session,
de la lampe et du flash. SHA-256 vérifié :
`8244d6d6227828b723a61d5d50da05d3628b550b5129d06f05d9667e76f85525`.
Installer par-dessus l'app actuelle sans désinstallation. Aucun déploiement
ADB effectué.

Scénarios de non-régression caméra à conserver pour les prochains APK :
lampe allumée → Produit → Scanner, Code-barres ↔ Liste écrite, fermeture du
panneau puis réouverture, arrière-plan puis retour. Vérifier l'absence d'éclair
fugitif, la réactivation manuelle de la lampe et la lecture répétée des codes.

## Mise à jour 0.1.19 — Première correction de la lampe (insuffisante sur téléphone)

La lecture des codes-barres de la **0.1.18 est confirmée fonctionnelle par
l'utilisateur**, y compris les lectures suivantes.

Scénario distinct signalé pour la lampe : l'activer dans Code-barres ou Liste
écrite, quitter cette vue puis revenir. L'abonnement natif de l'ancienne vue
restait attaché à l'Activity et pouvait réappliquer sa préférence de lampe.
Le patch versionné `mobile/patches/expo-camera@58.0.11.patch` retire cet
abonnement, éteint/réinitialise la lampe lors de la destruction de la vue et
libère sa référence caméra. Le module caméra Android est explicitement
compilé depuis les sources afin de ne pas utiliser l'AAR précompilé non corrigé.

Validation du 21 octobre : compilation Kotlin Android **debug et release**
réussie ; **3 tests natifs Robolectric**, **276 tests Jest**, TypeScript et
les **4 fichiers de tests de configuration** passent. Réinstallation pnpm
avec lockfile figé vérifiée. Ces contrôles ne remplacent pas le test du flash
physique sur le téléphone.

[APK Poduna 0.1.19](../artifacts/android/poduna-0.1.19-preview.apk) compilé
le 21 octobre : code Android **20**, ARM 32/64 bits, signature v2 avec le même
certificat que la 0.1.18. Contrôle des trois constructeurs ML Kit réussi et
nettoyage corrigé de `ExpoCameraView.cleanupCamera` vérifié dans le DEX de
l'APK (désabonnement, `setEnableTorch(false)`, référence caméra supprimée).
SHA-256 vérifié :
`646b68f8595cf81c09fb98333d828688c1190ad3a6395855962b07ee4bc06ea2`.
Installer par-dessus l'app actuelle, sans désinstaller. Pas d'installation ADB.

Le retour utilisateur confirme que cette première correction ne suffit pas
à empêcher l'éclair fugitif. Ne pas considérer la lampe validée sur la 0.1.19.

## Mise à jour 0.1.18 — Initialisation du moteur de codes-barres

Diagnostic ADB du 20 octobre 2026 sur le OnePlus 11, Android 16, avec la
0.1.17 (code 18) installée : l'aperçu démarre, mais le journal natif signale
`Failed to initialize BarcodeAnalyzer` avec une référence nulle dans
`BarcodeScanning.getClient`, inliné par R8 dans le constructeur de l'analyseur.
La correspondance R8 ramène le composant manquant à
`com.google.mlkit.vision.barcode.internal.zzg`.

L'inspection du DEX de cet APK montre que `BarcodeRegistrar` existe mais que
son constructeur sans argument a été supprimé. Ce registrar est découvert
par réflexion via les métadonnées du manifeste ; garder uniquement sa classe
ne suffit pas. Le plugin `withMlKitRegistrars.cjs` préserve explicitement les
constructeurs publics sans argument des registrars ML Kit. Il est réappliqué
aux prebuilds neufs et incrémentaux sans désactiver R8 ni ses optimisations.
Voir aussi la [documentation Android sur les constructeurs et R8](https://developer.android.com/topic/performance/app-optimization/full-mode).

`bash ops/check-apk-mlkit.sh chemin/vers/app.apk` contrôle les trois registrars
dans le DEX. Le lanceur de compilation exécute désormais ce contrôle avant
d'annoncer l'APK prêt. Il échoue bien sur la 0.1.17 (constructeur absent).

Contrôles à réaliser sur l'APK release, pas uniquement sur les mocks Jest :

- Vérifier que `BarcodeRegistrar`, `VisionCommonRegistrar` et
  `CommonComponentRegistrar` possèdent chacun un constructeur public `()V`
  dans le DEX optimisé.
- Installer par-dessus la version précédente, sans désinstaller ; présenter
  un EAN lisible et confirmer la réception effective d'un code.
- Vérifier une nouvelle ouverture du scanner, puis un second produit ;
  vérifier également la lecture d'un QR d'invitation.

Résultats de compilation : **release ARM 32/64 bits réussie**, version 0.1.18,
code Android 19. Les trois constructeurs sont présents dans le DEX optimisé ;
le contrôle automatique passe. Signature v2 et même certificat que la 0.1.17.
SHA-256 vérifié :
`1370dade73a5c21fac1fdc95a206f0598be0f5bf2efbccdb6e1b04e8efe23a29`.
TypeScript, 19 tests Jest du scanner, 4 tests Vitest du filtre de lecture et
les trois fichiers de tests de configuration passent. L'APK est fourni à
l'utilisateur sans installation ADB à sa demande : **lecture physique à
revalider après installation manuelle**.

L'allumage fugitif de la lampe est un problème distinct, non reproduit lors
de cette capture contrôlée et laissé de côté à la demande de l'utilisateur.
Aucune modification de ses commandes ou du cycle de vie caméra dans cette
version. Aucun remplacement de l'ancien composant ni rétrogradation d'Expo.

## Mise à jour 0.1.17 — Lecture, animations et partage (historique)

Retour utilisateur sur la 0.1.16 : image caméra présente mais aucun code lu ;
animations non perceptibles ; suppression définitive proposée dans le partage
après création d’un code ou chargement des membres.

- **Partage** : suppression du bouton de destruction serveur et de son callback
  dans ce panneau. Les invitations, leur révocation et le retrait d’un membre
  restent disponibles. La suppression locale via Options n’est pas transformée
  en destruction serveur.
- **Lecture** : mise au point activée après liaison de la caméra ; utilisation
  du GTIN brut Android lorsqu’il est valide ; événement de code accepté même
  s’il précède `onCameraReady` ; deux lectures concordantes permises jusqu’à
  cinq secondes d’écart au lieu d’une. Somme de contrôle, délai anti-doublon
  et confirmation par deux vrais événements conservés.
- **Diagnostic de lecture** : distinction entre « Aucune lecture reçue » et
  « Lecture reçue… confirmer » ; relance caméra disponible sans devoir fermer.
  Le modèle ML Kit est bien présent dans la 0.1.16 et l’analyseur existe dans
  son code compilé. Cela ne prouve pas qu’il fonctionne sur le téléphone.
- **Animations** : fondu plus perceptible (280 ms, départ à 25 % d’opacité),
  initialisé dès le premier rendu d’une nouvelle page quand les animations
  sont permises ; préférence système relue au retour au premier plan, même
  si Android n’a pas envoyé d’événement de changement.
- **Réglages → Diagnostic appareil** : état réellement lu par l’app
  (actives, réduites, en cours de vérification ou inaccessible) et bouton
  « Tester le fondu ». Aucun forçage contre la réduction des animations.

TypeScript, **345 tests Vitest + 272 tests Jest**, deux fichiers de configuration
et les parcours navigateur 320/390 px passent, animations normales et réduites.
[APK Poduna 0.1.17](../artifacts/android/poduna-0.1.17-preview.apk) :
compilation release ARM 32/64 bits réussie, code Android **18**, signature v2
et certificat identique aux 0.1.15/0.1.16 vérifiés. Bundle embarqué identique
au bundle de cette compilation. Intégrité SHA-256 vérifiée :
`f798bd56db3cd06462f8d0fe3e31fa12f5f8f066015f3c4d51d51af66ac23f25`.
Installer par-dessus la version précédente, sans désinstaller.

**Limite importante** : la cause exacte de la régression de lecture sur ce
téléphone n’a pas été reproduite ici. Les nouveaux tests reproduisent les cas
de callbacks tardifs/lents et de valeur Android brute, pas la caméra physique.
Aucun appareil ADB connecté lors du contrôle. Si le scanner reste muet, relever
le message sous la caméra ; si le fondu reste absent, relever l’état indiqué
dans Diagnostic appareil. Des logs Android du scanner pourront être nécessaires.

L’[historique officiel expo-camera](https://github.com/expo/expo/blob/main/packages/expo-camera/CHANGELOG.md)
indique déjà les correctifs de flux caméra intégrés à la version 58.0.11 utilisée ;
aucun correctif natif plus récent n’a été appliqué ni inventé pour cette version.

## Mise à jour 0.1.16 — Migration et animations discrètes

Version 0.1.16, code Android **17**, package `com.smartshopping.app` conservé.
Cette version reprend la [migration Expo 58](MIGRATION_EXPO_58.md).

[APK Poduna 0.1.16](../artifacts/android/poduna-0.1.16-preview.apk) ·
[SHA-256](../artifacts/android/poduna-0.1.16-preview.apk.sha256).
Compilation release réussie le 20 octobre, ARM 32/64 bits, **52 342 459 octets**.
Signature v2 vérifiée ; certificat SHA-256 identique à la 0.1.15 :
`b771d84b4ecae6434ffa325a2e21acffd3e7a24ef9ad21eed5b3cf63b96e1cc4`.
Le JavaScript embarqué correspond au bundle généré lors de cette compilation.
Intégrité APK vérifiée :
`50be7f0a3c47eb1dd285d4eb719d4937eb0f90d68cc945b1c76fbe08db31f671`.

- Fondu court des pages, des panneaux et des onglets Produit/Scanner/Dictée.
- Retour visuel progressif à l’appui ; apparition des confirmations d’ajout
  et des changements de quantité.
- Aucun déplacement ni redimensionnement animé des contrôles. Pas de délai
  sur les actions, de remontage des brouillons, de sortie différée gardant la
  caméra active, ni d’animation infinie.
- Réduction des animations respectée dès que la préférence Android est connue
  et lors de ses changements ; animations désactivées tant qu’elle est inconnue.
- Pas de nouvelle bibliothèque : [Animated](https://reactnative.dev/docs/animated)
  et [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo).

Contrôles locaux : TypeScript, **344 tests Vitest + 270 tests Jest**, deux
fichiers de tests de configuration et les trois parcours visuels à 320/390 px
réussis. Les tests vérifient notamment le retour fixe, les brouillons conservés,
les contrôles d’au moins 48 px et les changements de préférence d’animation.
Le parcours de navigation passe aussi avec réduction des animations activée
dans Chromium. Ces contrôles ne remplacent pas la recette sur téléphone.

À tester sur téléphone, après sauvegarde puis installation **sans désinstaller** :

1. Retrouver les listes, thèmes, rayons mémorisés et l’adresse du serveur.
2. Naviguer entre Mes listes, une liste, Réglages et les panneaux ; revenir avec
   le bouton de l’app puis avec le retour Android.
3. Répéter Produit → Dictée → Produit → Dictée, puis Scanner → Produit → Dictée,
   avec clavier ouvert et après défilement : pas de flash de la liste dessous,
   de bouton agrandi, de perte de texte ni de saut de hauteur.
4. Ajouter/cocher des articles, changer une quantité, toucher rapidement
   plusieurs fois : les données ne doivent pas dépendre de la fin d’une animation.
5. Activer le réglage Android de suppression/réduction des animations puis
   refaire la navigation. Les écrans restent pleinement visibles et utilisables.
6. Vérifier photo OCR, flash, annulation, dictée locale, sauvegarde et partage
   avec le serveur HTTPS de test. Aucun téléphone réel n’a été utilisé ici.

## Mise à jour 0.1.15 — Relecture vocale et retour fixe

[APK Poduna 0.1.15](../artifacts/android/poduna-0.1.15-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.15-preview.apk.sha256)

Installer par-dessus la version actuelle, sans désinstaller. Code Android **16**,
56 266 508 octets, paquet inchangé et certificat identique à la 0.1.14.
Signature v2, intégrité, version et architectures ARM 32/64 bits vérifiées.
Le bundle correspond à la nouvelle compilation et contient le pied fixe de dictée.
Canal preview avec configuration du serveur de test, sans URL embarquée.

SHA-256 : `d4d94e5c3d2148ba0cd133c0ca0c64398f4e840313d5d928eecd4a9fd4fc3cdf`.

TypeScript, 337 tests Vitest, 261 tests Jest et 24 tests de configuration réussis.
Aperçu navigateur contrôlé à 320/390 px, y compris les défilements répétés.
Aucun téléphone utilisé. Le téléchargement du site n’a pas été modifié.

### Recette téléphone prioritaire

1. **Clignotement** : ouvrir Dicter, descendre en bas, attendre une vingtaine de
   secondes puis faire plusieurs allers-retours de défilement. Refaire après une
   dictée, puis avec le clavier ouvert et fermé. Le bouton Retour doit rester fixe,
   lisible et cliquable, sans clignoter.
2. **Navigation et micro** : Retour ramène à Produit sans flash de la liste. Revenir
   à Dicter conserve le brouillon. Quitter pendant l’écoute coupe le micro et ignore
   toute réponse tardive.
3. **Corrections** : dicter une courte liste, tester une suggestion, « Annuler la
   dernière correction » et « Conserver ce texte », puis valider l’import. Si tout
   est correctement reconnu, saisir volontairement `Tomtaes` dans la relecture pour
   tester l’interface de suggestion. Rien n’est corrigé ou ajouté automatiquement.
   Le cas `1` reste manuel : aucune exception `1 → Pain`.
4. **Quantités** : passer de 1 à 2, puis revenir à 1 dans la liste : affichage `− 2 +`
   sans ×, nombre et − masqués à 1. Vérifier aussi une dictée « deux oranges puis du lait ».

Ces tests de dictée et de quantités ne nécessitent pas le serveur ; la reconnaissance
vocale reste locale Android. Les correctifs photo validés dans la 0.1.14 sont conservés.

## Historique 0.1.14 — Quantités simplifiées et correctifs photo

[APK Poduna 0.1.14](../artifacts/android/poduna-0.1.14-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.14-preview.apk.sha256)

Installer par-dessus la version actuelle, sans désinstaller. Code Android **15**,
56 264 128 octets, paquet inchangé et certificat identique à la 0.1.13.
Signature v2, intégrité, version et architectures ARM 32/64 bits vérifiées.
Canal preview avec configuration du serveur de test, sans URL embarquée.

SHA-256 : `67ac835c98eac444be2821f8f3627cb262fc44a75ac5be3002b15dc214b683bf`.

TypeScript, 331 tests Vitest, 254 tests Jest et 24 tests de configuration réussis.
Aucun téléphone utilisé : les points ci-dessous restent à confirmer sur appareil.
Le téléchargement du site n’a pas été modifié ; utiliser le fichier lié ici.

### Quantités simplifiées

Dans l’ajout manuel, la quantité reste saisissable directement et vaut 1 par défaut.
Le bouton − apparaît seulement au-delà de 1. Dans la liste, seul + apparaît à 1 ;
au-delà, les commandes deviennent − ×2 + (ou la quantité correspondante), sans
checkbox supplémentaire. Revenir à 1 masque à nouveau le nombre et le bouton −.
La limite de 999 et les quantités importées par scan ou dictée restent inchangées.

Aperçu navigateur 320/390 px vérifié, avec cibles tactiles d’au moins 48 px.
Tester les transitions 1 → 2 → 1 dans l’ajout et dans la liste.

### Correctifs photo

- La lampe est désactivée dès que la capture se termine, avant de transmettre la
  photo au panneau OCR, y compris si la capture échoue ou dépasse la taille permise.
- « Annuler » efface la photo, le texte et les choix de correction. Une réponse OCR
  tardive ne restaure pas une photo annulée et ne remplace pas la suivante.
- Changer simplement d’onglet conserve toujours le brouillon.

À vérifier sur téléphone avec cette compilation : allumer la
lampe puis photographier ; annuler pendant la lecture ou après correction ; rouvrir
Liste écrite et vérifier qu’elle propose une nouvelle photo sans ancien résultat.

## Archives des APK

Nettoyage du 15 octobre 2026 : seuls les APK 0.1.15 (dernier test), 0.1.14
(retour arrière) et 0.1.11 (téléchargement du site) restent dans `artifacts/android/`.
Les versions plus anciennes et leurs empreintes ont été déplacées dans la corbeille
du système ; les notes ci-dessous restent historiques. Voir [le bilan du nettoyage](NETTOYAGE_PROJET.md).

## Historique 0.1.13 — Scanner unifié et retours continus

Menu Produit / Scanner / Dicter dans une seule fenêtre. Scanner propose le sélecteur
Code-barres / Liste écrite avec des commandes exclusives. Retour ramène au formulaire
sans fermer puis rouvrir la fenêtre ; les brouillons restent conservés lors des
changements de mode. Caméra et micro s’arrêtent lorsqu’on quitte leur mode.

APK Poduna 0.1.13 et fichier SHA-256 retirés des téléchargements locaux (corbeille du 15 octobre 2026).

Installer par-dessus la version actuelle, sans désinstaller. Code Android **14**,
56 263 544 octets, paquet inchangé et certificat identique à la 0.1.12.
Signature v2, version, intégrité, bundle contenant le nouvel ajout et architectures
ARM 32/64 bits vérifiés. Canal preview sans URL de serveur embarquée.

SHA-256 : `284bea86e0cf2fd2bc83bc2b289513273fd8f98ebc6802ec3f5e20cc3b481a1b`.

TypeScript, 331 tests Vitest, 245 tests Jest et 24 tests de configuration réussis.
À confirmer sur téléphone : absence du flash avec Retour, passage entre les deux
modes de scan, conservation des brouillons et arrêt du micro lors d’un changement
de mode. Aucun téléphone utilisé pendant la compilation. Le site reste sur la
0.1.11 ; utiliser le fichier lié ici. Aucun backend ni tunnel redémarré.

## Historique 0.1.12 — Ajout simplifié et dictée locale

Dans l’ajout manuel, « Saisir » devient « Produit » et les rayons reconnus ou déjà
mémorisés ne sont plus affichés. Un produit « À classer » propose un choix facultatif,
mémorisé seulement après l’ajout réussi. Le bouton « Dicter » utilise exclusivement
le moteur local Android ; le texte et les quantités restent à vérifier avant import.

Installer **par-dessus la version actuelle, sans désinstaller**, code Android **13**.
Paquet inchangé (`com.smartshopping.app`), certificat identique à la 0.1.11 :
`b771d84b4ecae6434ffa325a2e21acffd3e7a24ef9ad21eed5b3cf63b96e1cc4`.

APK Poduna 0.1.12 et fichier SHA-256 retirés des téléchargements locaux (corbeille du 15 octobre 2026).

SHA-256 : `b4392849f0de2842b05972e53aa92e0bd80427663202b64b090915e454040b8c`.

Compilation du 11 octobre 2026 : 56 262 128 octets, signature v2 et intégrité vérifiées,
ARM 32/64 bits, version et code contrôlés dans l’APK. Module natif PodunaSpeech,
bundle embarqué et permission microphone présents. Canal preview avec configuration
manuelle du serveur, sans URL embarquée ni clé privée de signature.
TypeScript, 331 tests Vitest, 240 tests Jest et 24 tests de configuration réussis.
Aucun téléphone utilisé pour valider l’installation ou la qualité de reconnaissance.

À essayer : Ajouter un article → Dicter → Commencer la dictée, puis « deux oranges,
puis du lait, puis trois yaourts ». Si le moteur et le français sont installés,
tester en mode avion. Aucun ajout sans validation, ni bascule vers un service en ligne.
Voir la [recette vocale](SAISIE_VOCALE.md) pour les permissions et interruptions.
Le backend et le tunnel n’ont pas été redémarrés ; le téléchargement du site reste
sur la 0.1.11, utiliser le lien ci-dessus pour cette nouvelle version.

## Historique 0.1.11 — Rayons personnels et noms harmonisés

Rayon choisi mémorisé sur l’appareil et réutilisé par saisie, scan et OCR ; normalisation prudente des pluriels français connus ; regroupement des rayons Animaux, Soins visage, corps & cheveux et Hygiène & beauté ; Premiers soins renommé Parapharmacie. Boutons légèrement réduits en conservant les cibles tactiles de 48 points minimum. Le correcteur OCR de la 0.1.10 reste inclus.

Installer **par-dessus la version actuelle, sans désinstaller**, code Android **12**. Signature v2 vérifiée identique à la 0.1.10 : certificat SHA-256 `b771d84b4ecae6434ffa325a2e21acffd3e7a24ef9ad21eed5b3cf63b96e1cc4`. Paquet et stockage inchangés.

[APK Poduna 0.1.11](../artifacts/android/poduna-0.1.11-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.11-preview.apk.sha256)

SHA-256 : `ba9f1406f2df3ba2dfa08ed7f30b12147a80774ffe7f064b21407b7165955654`.

APK produit le 8 octobre, contrôlé le 9 octobre 2026 : environ 54 Mio, Android 7 minimum, ARM 32/64 bits. Signature, intégrité, version, présence des nouveautés dans le bundle et configuration preview sans URL embarquée vérifiées ; aucune clé privée ni permission microphone. TypeScript, 305 tests Vitest, 223 tests Jest et tests de configuration réussis. Installation sur téléphone non effectuée.

À essayer : classer un produit « À classer », le supprimer puis le rajouter (également après réouverture et dans une autre liste) ; ajouter « Oranges » puis « Orange » ; vérifier les rayons regroupés et les boutons. Les pluriels inconnus ne sont pas modifiés arbitrairement.

Les réponses de l’ancien serveur restent reconnues par l’app. Les adaptations des libellés communautaires et des colonnes OCR côté backend nécessitent toujours sa mise à jour ; aucun backend ni tunnel redémarré. Depuis le 10 octobre, le téléchargement du site propose également cet APK 0.1.11 existant, après vérification de version, signature et SHA-256.

## Historique 0.1.10 — Correction des listes écrites

Suggestions affichées dès la lecture, vocabulaire de courses élargi, corrections probables acceptables en groupe et choix individuels pour les lectures incertaines. Possibilité de conserver un mot ou d’annuler la dernière correction. Les marques courantes, les noms déjà présents dans la liste et les quantités restent protégés.

Installer **par-dessus la version précédente, sans désinstaller**, code Android **11**. Signature vérifiée identique à la 0.1.9 : certificat SHA-256 `b771d84b4ecae6434ffa325a2e21acffd3e7a24ef9ad21eed5b3cf63b96e1cc4`. Paquet, base locale, identités, préférences et réglage serveur inchangés.

**Le nouveau correcteur est utilisable avec le serveur OCR actuel.** La meilleure séparation et remise en ordre des colonnes est une modification côté serveur : elle nécessite sa recompilation et son redémarrage, non effectués ici. L’APK ne met pas à jour le serveur. Le site local conserve son téléchargement 0.1.9 ; utiliser le nouvel artefact lié ci-dessous pour cet essai.

APK Poduna 0.1.10 et fichier SHA-256 retirés des téléchargements locaux (corbeille du 15 octobre 2026).

SHA-256 : `bae65abe414fdd013c6ebb55f058f26e36a79d2b48af814d533b15f8c3198ff4`.

Compilation release réussie le 8 octobre 2026, environ 54 Mio, Android 7 minimum, ARM 32/64 bits. Signature v2, version, bundle contenant les nouveaux contrôles OCR et configuration preview sans adresse de tunnel embarquée vérifiés ; microphone absent. TypeScript, 298 tests Vitest, 217 tests Jest et les tests de configuration réussis. Aucun essai d’installation sur téléphone effectué.

Pour tester : photographier la même liste, vérifier les propositions immédiates, appliquer les corrections probables puis annuler, choisir individuellement les lectures incertaines et relire avant l’import. Les retours à la ligne peuvent encore nécessiter une correction manuelle tant que le serveur n’est pas mis à jour.

## Historique 0.1.9 — Poduna

Nouvelle identité : nom affiché Poduna, panier arrondi vectoriel, icône, avant-plan adaptatif Android, écran de lancement et textes d’invitation/permissions/sauvegarde. Les sept thèmes et le choix existant sont conservés. Les listes personnelles sans synchronisation ni indicateur inutile font désormais partie de cet APK.

Installer **par-dessus la version précédente, sans désinstaller**, code Android **10**. Le paquet `com.smartshopping.app`, le schéma `smartshopping://`, la base `smartshopping.db`, les clés d’identité/préférences et le format `smartshopping-lists` restent inchangés. Les nouvelles sauvegardes portent le préfixe Poduna, les anciennes restent lisibles.

Signature vérifiée identique à la 0.1.8 : certificat SHA-256 `b771d84b4ecae6434ffa325a2e21acffd3e7a24ef9ad21eed5b3cf63b96e1cc4`. SHA-256 de l’APK : `8bc9045d7fb9e2d5a7c7bfbda9f2c6cb16b8fb2d6a0663c5ddb5883757cb1d09`. Le site local propose ce même fichier. Aucun backend ni tunnel n’a été démarré. L’installation/mise à jour et l’écran de lancement restent à vérifier sur téléphone ; aucun appareil n’a été utilisé pendant cette préparation.

## Historique 0.1.8

Thème **Origine**, assorti au site : ivoire, sauge et vert profond, disponible dans **Réglages → Apparence**. Il devient le défaut sans préférence valide ; les thèmes déjà choisis sont conservés. Ajout de **Compléments alimentaires** et **Premiers soins** (31 entrées avec À classer), meilleure reconnaissance des protections périodiques dans Hygiène & beauté et taxonomies actualisées. Aucun reclassement des articles déjà enregistrés.

Installer **par-dessus la version précédente, sans désinstaller**, code Android **9**. Le backend devra lui aussi utiliser les nouvelles correspondances pour les recherches en ligne ; il n’est pas redémarré par la compilation. Le réglage du serveur de test et les limites communautaires de la 0.1.7 restent inchangés. Le site local propose désormais ce même APK 0.1.8, préparé après contrôle SHA-256, sans recompilation. Les changements ultérieurs de synchronisation locale ne sont pas inclus dans cet APK.

## Historique 0.1.7

Première tranche du catalogue communautaire : propositions de nom/rayon après échec de recherche, participation facultative et signalement avec cinq motifs. Depuis **Modifier l’article → Consulter la fiche communautaire**, accès aux valeurs actuellement validées et signalement séparé du nom ou du rayon. Si une ligne regroupe plusieurs codes-barres, le produit à consulter doit être choisi. Les choix privés et brouillons restent inchangés.

Installer **par-dessus la version précédente, sans désinstaller** : certificat identique à la 0.1.6, code Android **8**. L’adresse du serveur de test reste configurable. Le backend doit contenir les nouvelles routes et la migration communautaire pour permettre ces fonctions ; le catalogue reste **désactivé par défaut**, en attente de modération opérationnelle. Sur un serveur désactivé ou ancien, la consultation l’indique et la liste reste utilisable. Aucun serveur n’a été démarré pour cette compilation.

## Historique 0.1.6

Rayon Alcools séparé des boissons, proposition de renommage des produits non reconnus avec reprise du scanner après Enregistrer ou Plus tard, et notifications de 2,5 secondes. Le nom reste mémorisé pour les prochains scans. Boissons sans alcool et vinaigre de vin couverts par les tests de classement.

Installer **par-dessus la version précédente, sans désinstaller** : certificat conservé, code Android **7**. Le backend doit également utiliser les nouvelles correspondances. Son adresse HTTPS courante se lit avec `python3 ops/local-https.py status` et se renseigne dans Réglages → Serveur de test.

## Historique 0.1.5

Les catégories parentes des quatre catalogues alimentent les 28 rayons simples, avec choix manuel alphabétique. Les noms et rayons personnalisés des produits scannés sont mémorisés sur l’appareil, même après suppression d’un article. Messages temporaires de cinq secondes. OCR : nettoyage des symboles, suggestions orthographiques à accepter une par une, champ défilant et photo masquée pendant l’utilisation du clavier.

Installer par-dessus la version précédente, **sans désinstaller** : même signature, code Android **6**. Le serveur a également été recompilé avec les taxonomies ; utiliser son adresse courante dans Réglages → Serveur de test. [Fonctionnement et limites](RECHERCHE_PRODUITS.md#taxonomies-complètes-et-rayons-simples--015).

## Historique 0.1.4

Dix rayons détaillés supplémentaires pour les produits non alimentaires, de beauté et pour animaux. Les correspondances API et le classement par nom sont mis à jour côté serveur et mobile ; Beauty et Pet Food conservent désormais un rayon précis au lieu de forcer le rayon générique. Choix manuel et tri disponibles, anciennes affectations et préférences conservées. Voir [les nouveaux rayons](RECHERCHE_PRODUITS.md#rayons-détaillés-ajoutés-en-014).

Cette version inclut le scanner simplifié avec cadre thématique et délai de 1,5 seconde. Installer par-dessus la version précédente, sans désinstaller : signature conservée, code Android 5.

## Historique 0.1.3

Pause réduite à 1,5 seconde, anti-doublon conservé. Cadre de la caméra dans la couleur principale du thème lorsque la lecture est prête, atténué et en pointillés pendant l’attente ; état également indiqué par un texte court. Les indications techniques et répétitives sont retirées ; lampe, fermeture, dernier résultat et ajout volontaire restent disponibles. Le bouton de relance n’apparaît qu’en cas de problème ou après une invitation détectée.

Les quatre catalogues ont été vérifiés avec des produits réels. Un nom absent de leurs bases reste à saisir manuellement ; l’app le distingue d’un problème temporaire de connexion.

Installer par-dessus la version précédente, sans désinstaller : signature conservée, code Android 4.

## Historique 0.1.2

Installer l’APK par-dessus la version précédente, sans désinstaller : même signature, code Android 3. Pause de 3 secondes entre scans, lectures stables et checksum ; recherche cache → Food → Products → Beauty → Pet Food, arrêt au premier résultat. Le serveur et l’APK doivent tous deux être à jour. Voir [le fonctionnement détaillé](RECHERCHE_PRODUITS.md).

## Historique 0.1.1

Installer cet APK par-dessus la version 0.1.0, sans désinstaller : la clé de signature est conservée et le code de version augmente à 2. Le classement privilégie désormais les catégories API (dont les eaux), puis le nom en secours. Les caches de résultats anciens sont invalidés, sans modifier les articles déjà enregistrés ou leurs rayons personnalisés.

Le scanner reste ouvert pour enchaîner les produits. Le même code reste bloqué tant qu’aucun autre code n’a été présenté ; le bouton **Ajouter encore ce produit** permet d’augmenter sa quantité volontairement. **Fermer** ou le retour Android termine la session. Les scans d’invitation et la photo OCR gardent leur fonctionnement.

## Recompiler sur ce PC

```bash
bash ops/build-preview-apk.sh
```

Les outils sont dans `.local-dev/android-build` : Java 17, SDK Android 36, Build Tools 36, NDK et CMake. La licence du SDK a été acceptée avec l’accord explicite de l’utilisateur. Les chemins peuvent être remplacés avec `JAVA_HOME`, `ANDROID_HOME` et `SMARTSHOPPING_NODE_BINARY`.

Le lanceur génère Android avec Expo, compile `assembleRelease`, copie l’APK dans `artifacts/android` puis vérifie sa signature et écrit son SHA-256. Il ne démarre pas le serveur HTTPS ni Metro. Il limite Gradle à deux tâches de compilation simultanées pour cette machine.

**Conserver une sauvegarde privée du dossier `.local-dev/android-build/signing/`**, qui contient la clé et son mot de passe. Ils ne sont pas versionnés ni inclus dans l’APK. La même clé permet d’installer les prochaines versions sans changer de signature. Avant une publication publique, arrêter la stratégie de signature avec Google Play ; ne pas perdre ni remplacer cette clé en supposant que les mises à jour resteront compatibles.

Cet APK utilise `com.smartshopping.app`. Augmenter `android.versionCode` lors des prochaines versions distribuées. Les builds de production conservent l’obligation d’une API HTTPS fixe et n’activent pas le réglage du serveur de test.

## Contrôles historiques 0.1.8

Compilation réalisée le 7 octobre 2026 : APK d’environ 54 Mio, version `0.1.8` / code `9`, Android 7 minimum. Signature v2 et SHA-256 vérifiés, certificat identique à la 0.1.7, bundle embarqué avec Origine et les nouveaux rayons présent, bibliothèques `arm64-v8a` et `armeabi-v7a` présentes. La configuration embarquée active uniquement le serveur de test du canal `preview`, sans ancienne adresse de tunnel. Aucun fichier de clé privée de signature n’est inclus ; permission microphone absente.

Validation automatisée de cette compilation : TypeScript, 285 tests Vitest, 208 tests de composants Jest et 21 tests de configuration réussis. La compilation Android release a réussi. Les 37 tests Rust standard et 6 tests PostgreSQL avaient réussi lors du complément des rayons ; ils n’ont pas été relancés pour cette compilation mobile. La recette physique ci-dessous reste à effectuer ; le serveur de test n’a pas été redémarré. Les quatre tests externes optionnels (OCR réel, catalogues réels, Redis réel, Vault réel) n’ont pas été exécutés.

SHA-256 de l’APK 0.1.8 : `053389146c24cd0ed5b71ce8c57c95754bdba71ceeeb95c0f02f0b0ffa78af23`.

- Signature vérifiable avec `apksigner verify --verbose` et intégrité avec le fichier `.sha256`.
- Présence du bundle JavaScript embarqué et des bibliothèques ARM dans l’APK.
- Permissions caméra ; microphone interdit.
- À confirmer sur téléphone : lancement sans Expo Go, scan, OCR avec serveur actif, sauvegarde et partage entre deux installations APK.

### Recette 0.1.5 sur téléphone

- Scanner un produit, le renommer, le supprimer et le rescanner ; répéter dans une autre liste hors ligne.
- Ouvrir le choix du rayon et vérifier son ordre alphabétique.
- Photographier une liste de plus de dix lignes, corriger la dernière ligne avec le clavier ouvert.
- Afficher les suggestions d’orthographe et n’en accepter qu’une avant l’import.
- Vérifier la disparition des confirmations après cinq secondes, y compris pour deux ajouts identiques.

### Recette 0.1.6 sur téléphone

- Scanner un produit inconnu : Enregistrer le nom puis poursuivre le scan ; vérifier le même nom lors d’un prochain scan.
- Choisir Plus tard : l’article reste dans la liste et la caméra reprend.
- Ajouter Vin rouge et Bière sans alcool ; vérifier Alcools et Boissons respectivement.
- Vérifier l’accès manuel à Alcools et son déplacement dans le tri des rayons.
- Vérifier que chaque confirmation disparaît après 2,5 secondes.

### Recette 0.1.7 sur téléphone

- Installer au-dessus de la 0.1.6 sans désinstaller ; vérifier listes, préférences, réglage serveur et fonctionnement hors ligne.
- Modifier un article avec code-barres, commencer un renommage puis consulter sa fiche communautaire : revenir doit conserver le brouillon sans l’enregistrer.
- Serveur communautaire désactivé : vérifier le message d’indisponibilité, sans blocage de la liste.
- Dans un environnement de test isolé avec catalogue activé : consulter les valeurs validées, signaler le nom puis le rayon ; vérifier motif obligatoire, confirmation de réception, erreur réseau et réessai.
- Regrouper deux produits de même nom mais de codes-barres distincts : vérifier le choix du code à consulter, puis changer de code pendant une lecture lente.
- Après échec de recherche, sélectionner ou saisir un nom/rayon privé ; signaler une proposition ne doit ni activer la participation ni modifier ces choix.
- Ces contrôles ne constituent pas une autorisation d’ouvrir les contributions publiques : la modération opérationnelle et l’invalidation anticipée du cache mobile restent à terminer.

### Recette 0.1.8 sur téléphone

- Installer par-dessus la 0.1.7 sans désinstaller ; vérifier les listes, le thème choisi et l’adresse du serveur conservés.
- Dans Réglages → Apparence, sélectionner Origine ; fermer complètement et rouvrir l’app pour vérifier sa conservation.
- Vérifier les titres, boutons, articles cochés et textes agrandis avec Origine.
- Ajouter « Vitamine D3 » et « Pansements » ; vérifier respectivement Compléments alimentaires et Premiers soins, puis leur présence dans le choix manuel et le tri des rayons.
- Vérifier que « Crème vitamine C » reste en Hygiène & beauté et que les anciens articles ne changent pas de rayon automatiquement.
- Refaire un scan, un ajout hors ligne et une sauvegarde. Partage entre deux installations et communauté restent à essayer en environnement de test approprié.
