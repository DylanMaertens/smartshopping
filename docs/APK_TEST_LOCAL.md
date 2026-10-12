# APK Android de test autonome

L’APK se construit sur le PC, sans compte Expo, sans EAS et sans publication en boutique. Il embarque l’interface : Expo Go et Metro ne sont plus nécessaires sur le téléphone. Le serveur reste nécessaire pour partager, synchroniser, reconnaître une liste écrite et rechercher un produit en ligne.

## Installer et essayer

Le fichier produit par le lanceur est `artifacts/android/poduna-0.1.14-preview.apk`. C’est une compilation release signée avec une clé locale conservée sur ce PC ; le canal applicatif est `preview`. Elle prend en charge les téléphones ARM 64 bits et ARM 32 bits compatibles avec Android 7 ou plus récent. La dictée locale nécessite Android 12 minimum et un moteur vocal local compatible avec le français.

1. Copier l’APK sur le téléphone et l’ouvrir pour l’installer. Android peut demander d’autoriser cette source d’installation.
2. Ouvrir Poduna : les listes sont utilisables hors ligne immédiatement.
3. Pour activer les fonctions en ligne, démarrer `python3 ops/local-https.py` sur le PC.
4. Dans l’app : **Réglages → Serveur de test**, coller l’adresse HTTPS du tunnel puis **Connecter et redémarrer**. L’app vérifie la disponibilité et conserve l’adresse sur le téléphone. Ce réglage est limité à cet APK de test.
5. Faire la même opération sur le second téléphone, puis partager/rejoindre une liste.

Quand le tunnel redémarre, mettre sa nouvelle adresse dans ce réglage sur les deux appareils : aucune recompilation de l’APK n’est nécessaire. Le test de connexion n’envoie ni identité d’appareil ni contenu des listes. Il accepte uniquement HTTPS et conserve l’ancienne configuration si la vérification échoue. Changer l’adresse redémarre l’app pour que toutes les requêtes utilisent le même serveur.

Utiliser l’adresse du **même backend SmartShopping** : changer d’adresse de tunnel ne change pas la base ou les identités du serveur. Ne pas utiliser ce réglage pour passer arbitrairement entre différentes bases.

**Les données d’Expo Go ne sont pas transférées automatiquement.** Conserver Expo Go et sa sauvegarde. Restaurer une sauvegarde dans l’APK crée des copies indépendantes ; pour conserver une liste partagée, la rejoindre avec une invitation valide. Les deux applications ont des identités d’appareil différentes.

## Mise à jour 0.1.14 — Quantités simplifiées et correctifs photo

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

## Historique 0.1.13 — Scanner unifié et retours continus

Menu Produit / Scanner / Dicter dans une seule fenêtre. Scanner propose le sélecteur
Code-barres / Liste écrite avec des commandes exclusives. Retour ramène au formulaire
sans fermer puis rouvrir la fenêtre ; les brouillons restent conservés lors des
changements de mode. Caméra et micro s’arrêtent lorsqu’on quitte leur mode.

[APK Poduna 0.1.13](../artifacts/android/poduna-0.1.13-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.13-preview.apk.sha256)

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

[APK Poduna 0.1.12](../artifacts/android/poduna-0.1.12-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.12-preview.apk.sha256)

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

[APK Poduna 0.1.10](../artifacts/android/poduna-0.1.10-preview.apk) · [SHA-256](../artifacts/android/poduna-0.1.10-preview.apk.sha256)

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
