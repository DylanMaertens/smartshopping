# Migration mobile Expo 58 — 19–20 octobre 2026

## Périmètre et protection du travail existant

Migration locale sur **`codex/stable-upgrade-preflight`**, depuis
`98b75b80011c0d0bf53dd375073ebcd63f9da83b`. La branche d’origine
`codex/reliable-beta-evidence` reste sur ce commit. Aucun push, merge,
déploiement, accès à une base réelle ni installation sur téléphone.

La [vérification avant migration](VERIFICATION_AVANT_MIGRATION.md) conserve
les résultats de référence SDK 54, notamment les intégrations serveur.
Le backend n’est pas modifié par cette migration.

L’ancien projet Android généré est conservé localement dans
`.local-dev/android-sdk54-reference` (ignoré par Git). Le nouveau est généré
dans `mobile/android`, également ignoré. Les clés privées de signature ne
sont ni modifiées ni copiées dans le dépôt. Une branche Git ne sauvegarde
pas les données du téléphone ni ces fichiers privés.

## Versions et étapes

| Élément | Référence | Cible installée |
| --- | --- | --- |
| Expo | 54.0.37 | 58.0.16 |
| React Native | 0.81.5 | 0.88.0 |
| React / renderer de tests | 19.1.0 | 19.3.0 |
| TypeScript | 5.9.3 | 6.0.3 |
| Jest / jest-expo | 29 / SDK 54 | 30.5.2 / 58.0.11 |
| Expo Doctor | 1.17.11 | 1.21.5 |

Les modules Expo caméra, fichiers, SQLite, SecureStore, réseau, partage,
polices et client de développement suivent les versions compatibles du SDK.
Le splash utilise désormais le plugin `expo-splash-screen`.

Progression effectuée : SDK 54 → 55.0.31 → 57.0.30 → 58.0.16.
TypeScript, les tests mobile et la configuration ont été vérifiés aux étapes
55 et 57, puis sur la cible. Les ruptures SDK 56 ont été examinées ; son
runtime intermédiaire n’a pas été conservé.

React 19.3.0 et TypeScript 6.0.3 sont les versions retenues pour la compatibilité
Expo, pas une mise à jour indépendante de chaque paquet vers son plus grand
numéro. Vitest 4.1.11 et les correctifs de sécurité précédents sont conservés.
Les commandes EAS distantes, épinglées séparément, ne sont pas validées par ce
build local.

Références : [procédure Expo](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/),
[SDK 55](https://expo.dev/changelog/sdk-55),
[SDK 56](https://expo.dev/changelog/sdk-56),
[SDK 57](https://expo.dev/changelog/sdk-57),
[SDK 58](https://expo.dev/changelog/sdk-58).

## Adaptations de compatibilité

- **Données locales** : Android/iOS continuent explicitement à utiliser SQLite
  pour le stockage clé/valeur, même si le runtime expose `localStorage`.
  Trois tests couvrent cette sélection et le comportement web. Identifiants,
  clés de stockage, nom de base et package Android restent inchangés.
- **Types natifs** : références de champs saisissables en `TextInputInstance`,
  URL initiale éventuellement absente, événements de retour et résultats de
  partage adaptés dans les tests. Pas de désactivation globale du typage strict.
- **TypeScript / tests** : chemin explicite `expo/tsconfig.base.json`, retrait
  de l’ancien `baseUrl` et ajout du preset Jest React Native désormais séparé.
- **Configuration Expo** : la configuration dynamique reprend celle fournie
  par Expo ; le splash passe de l’ancienne propriété au plugin, en conservant
  l’image et la couleur de fond.
- **Aperçus web** : résolution du registre d’assets SVG vers React Native Web
  et isolation du module audio réservé à Android. Cette adaptation esbuild
  n’est pas appliquée à Metro ni à l’application Android.
- **Génération native** : `prebuild --no-clean` pour les commandes locales
  ordinaires ; le nettoyage reste explicite avec `prebuild:clean`.
  Le script APK utilise Android SDK 37 / Build-Tools 37.0.0.
- **Scénarios Maestro** : navigation remise au niveau de l’interface actuelle,
  isolation des données, scénario hors ligne limité aux listes locales.
  Le workflow compile une variante release contenant son JavaScript pour
  fonctionner sans Metro ; sa signature jetable de CI n’est pas celle de
  distribution. Ce workflow n’a pas été exécuté sur GitHub.

Le lockfile est mis à jour et son installation figée a réussi. pnpm a ajouté
des exceptions de délai de publication pour **12 versions précises** de la
chaîne Expo, pas une désactivation générale de cette protection. Les réévaluer
à la prochaine mise à jour. Aucune exception d’avis de sécurité n’est ajoutée.

## Validation et limites

Résultats obtenus sur la cible :

- Expo Doctor : **20/20 contrôles réussis** ; dépendances Expo compatibles ;
  aucune incompatibilité de peer dependencies signalée.
- TypeScript : réussi.
- Vitest : **344 tests réussis** ; Jest : **266 tests réussis**.
- Configuration/build : **2 fichiers de tests réussis**.
- Trois parcours visuels navigateur : courses, correction OCR et
  navigation Produit/Scanner/Dictée, réussis à 320 et 390 px.
- Export Android Metro/Hermes : réussi, **1 109 modules**.
- Compilation native Android arm64 debug : **réussie** le 20 octobre
  (`:app:assembleDebug`), module Kotlin `poduna-speech` inclus.
- Compilation Android arm64 **release optimisée réussie**
  (`:app:assembleRelease`, 11 min 8 s), avec le JavaScript embarqué dans
  `assets/index.android.bundle`. Vérification de signature réussie :
  **Android Debug**, pas la clé privée de distribution.
- Manifest APK contrôlé : package `com.smartshopping.app`, nom Poduna,
  version 0.1.15/code 16 conservée, minSdk 24, targetSdk 36, compileSdk 37,
  permissions caméra/micro présentes.

Le build utilise JDK 17, Gradle 9.4.1, NDK 27.1.12297006 et Build-Tools 37.0.0.
Les plugins amont émettent encore des avertissements de dépréciation Gradle
et de catalogue Kotlin ; le build réussit, mais cela ne valide pas Gradle 10.

Contrôles reproductibles depuis `mobile` :

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm test:components --silent
pnpm test:build-config
pnpm exec expo-doctor
```

Expo Doctor nécessite aussi `npm` sur le PATH pour certains contrôles du
graphe. Après reprise, son premier essai a échoué faute de cet outil ; avec
npm 11.21.1 installé uniquement dans `/tmp`, les **20 contrôles repassent**.
Les trois scripts `preview/check-shopping.mjs`, `preview/check-ocr.mjs` et
`preview/check-voice.mjs` nécessitent Playwright/Chromium et un serveur loopback.
La syntaxe YAML du workflow et des quatre scénarios Maestro a été contrôlée,
mais ce n’est pas une exécution des scénarios sur appareil.

L’export conserve un avertissement de résolution de
`@noble/hashes/crypto.js` avec fallback. Les tests navigateur utilisent des
doublures natives ; leur hauteur réduite simule le clavier, sans tester le
clavier Android. Aucun test micro/caméra physique, émulateur Maestro ni build
iOS n’a été exécuté. L’absence de KVM empêche ici une recette accélérée sur
émulateur. Les builds debug et release de validation sont signés avec une clé
debug : ils ne constituent pas des APK de distribution et ne doivent pas
remplacer l’installation existante signée avec une autre clé. Seul arm64 a
été compilé localement ; les autres architectures restent à vérifier.

L’audit JavaScript reste bloquant avec **6 avis (3 élevés, 3 modérés)**,
contre 8 avant migration : les deux avis `image-size` disparaissent avec
la nouvelle chaîne Metro. L’avis Rust résiduel est inchangé, le lockfile backend
n’ayant pas été modifié. Voir [les risques résiduels](SECURITE_DEPENDANCES.md).
Ces audits ne couvrent pas toutes les dépendances natives Gradle ni le système.

## Recette téléphone avant fusion

Préparer une sauvegarde puis, lors de la prochaine demande d’APK, compiler
avec **la signature existante** et installer **sans désinstaller** l’ancienne
application. Ne pas tester la conservation des données avec un APK debug
signé différemment.

1. Vérifier les listes existantes, articles cochés, quantités, rayons mémorisés,
   thème, adresse serveur et accès aux listes partagées.
2. Ajouter/modifier des articles en mode avion, redémarrer, reconnecter ;
   une liste locale ne doit pas lancer de synchronisation.
3. Alterner Produit → Dictée → Produit → Dictée et Scanner → Dictée ;
   contrôler clavier, pied de page, retour et brouillons.
4. Tester code-barres et photo OCR, flash, annulation et permission refusée.
5. Tester dictée locale, correction, annulation et passage en arrière-plan.
6. Exporter puis restaurer une sauvegarde sur une installation de test ;
   vérifier les formats v1/v2 et les préférences, sans écraser les données utiles.
7. Sur deux installations de test, vérifier invitation QR/lien, modifications
   concurrentes, reconnexion et révocation avec le serveur de test.

Ne pas considérer la migration comme entièrement validée pour publication
avant cette recette et le traitement explicite des alertes restantes.
