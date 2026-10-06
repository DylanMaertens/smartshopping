# APK Android de test autonome

L’APK se construit sur le PC, sans compte Expo, sans EAS et sans publication en boutique. Il embarque l’interface : Expo Go et Metro ne sont plus nécessaires sur le téléphone. Le serveur reste nécessaire pour partager, synchroniser, reconnaître une liste écrite et rechercher un produit en ligne.

## Installer et essayer

Le fichier produit par le lanceur est `artifacts/android/smartshopping-0.1.6-preview.apk`. C’est une compilation release signée avec une clé locale conservée sur ce PC ; le canal applicatif est `preview`. Elle prend en charge les téléphones ARM 64 bits et ARM 32 bits compatibles avec Android 7 ou plus récent.

1. Copier l’APK sur le téléphone et l’ouvrir pour l’installer. Android peut demander d’autoriser cette source d’installation.
2. Ouvrir SmartShopping : les listes sont utilisables hors ligne immédiatement.
3. Pour activer les fonctions en ligne, démarrer `python3 ops/local-https.py` sur le PC.
4. Dans l’app : **Réglages → Serveur de test**, coller l’adresse HTTPS du tunnel puis **Connecter et redémarrer**. L’app vérifie la disponibilité et conserve l’adresse sur le téléphone. Ce réglage est limité à cet APK de test.
5. Faire la même opération sur le second téléphone, puis partager/rejoindre une liste.

Quand le tunnel redémarre, mettre sa nouvelle adresse dans ce réglage sur les deux appareils : aucune recompilation de l’APK n’est nécessaire. Le test de connexion n’envoie ni identité d’appareil ni contenu des listes. Il accepte uniquement HTTPS et conserve l’ancienne configuration si la vérification échoue. Changer l’adresse redémarre l’app pour que toutes les requêtes utilisent le même serveur.

Utiliser l’adresse du **même backend SmartShopping** : changer d’adresse de tunnel ne change pas la base ou les identités du serveur. Ne pas utiliser ce réglage pour passer arbitrairement entre différentes bases.

**Les données d’Expo Go ne sont pas transférées automatiquement.** Conserver Expo Go et sa sauvegarde. Restaurer une sauvegarde dans l’APK crée des copies indépendantes ; pour conserver une liste partagée, la rejoindre avec une invitation valide. Les deux applications ont des identités d’appareil différentes.

## Mise à jour 0.1.6

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

## Contrôles

Compilation réalisée le 5 octobre 2026 : APK d’environ 54 Mio, version `0.1.6` / code `7`, Android 7 minimum. Signature v2 et SHA-256 vérifiés, bundle embarqué présent, bibliothèques `arm64-v8a` et `armeabi-v7a` présentes. La configuration embarquée active uniquement le serveur de test du canal `preview`, sans ancienne adresse de tunnel. Aucune clé privée de signature n’est incluse.

Validation automatisée : TypeScript, 247 tests Vitest, 175 tests de composants Jest et 21 tests de configuration réussis. La compilation Android release a réussi. La recette physique ci-dessous reste à effectuer ; le serveur de test a été redémarré avec le classement corrigé. Son adresse courante est disponible avec `python3 ops/local-https.py status`.

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
