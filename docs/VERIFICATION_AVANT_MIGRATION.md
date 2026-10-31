# Vérification de référence avant migration Expo / React Native

Date : **19 octobre 2026**. Périmètre : fonctionnalités Android, intégrations
mobile/serveur et protections des données avant une future mise à jour.

Ce document est le **bilan historique avant migration**. Les changements et
résultats ultérieurs figurent dans [la migration Expo 58](MIGRATION_EXPO_58.md).

## État préservé

- Branche de départ : `codex/reliable-beta-evidence`.
- Commit de référence : `98b75b80011c0d0bf53dd375073ebcd63f9da83b`.
- Arbre de travail propre au démarrage : le travail existant était déjà commité.
- Branche créée et sélectionnée : **`codex/stable-upgrade-preflight`**, depuis ce
  même commit. La branche de départ n’a pas été déplacée.
- Aucune mise à jour de dépendance, modification fonctionnelle, migration de base
  réelle, compilation APK, publication ou opération de push pendant ce contrôle.
  Seul ce bilan est ajouté aux sources ; il n’est pas encore commité.

Référence logicielle : Expo 54.0.37, React Native 0.81.5, React 19.1.0,
Vitest 4.1.11. Ce bilan ne certifie pas encore leur compatibilité avec un SDK futur.

## Fonctionnalités et intégrations vérifiées

| Fonction | Intégration examinée | Preuves et limites |
| --- | --- | --- |
| Listes, articles et quantités | `HomeScreen`, regroupement des articles, validation/singulier, `ShoppingListStorage` | Tests de composants et SQLite : ajout, modification, coche, suppression, doublons, limites et persistance. |
| Rayons et préférences | Classification commune mobile/backend, choix manuel, préférences par nom/code-barres | Tests : 27 rayons, anciennes catégories reconnues, choix mémorisé, rayon reconnu masqué à l’ajout. Parcours navigateur à 320/390 px. |
| Scanner | `BarcodeScannerPanel`, expo-camera, recherche produit puis enrichissement de l’article | Tests de composants : permissions, capture, arrêt du flash, verrouillage/reprise. Catalogues externes testés avec serveurs factices, pas en direct. Caméra physique non testée ici. |
| Liste écrite / OCR | Capture → API signée → moteur OCR serveur → correction locale → validation/import | Tests du parsing, des suggestions/annulations et de l’import ; 12 tests Python avec modèles locaux, dont une image imprimée synthétique en deux colonnes. Le parcours complet caméra Android → HTTP → OCR réel reste à refaire sur téléphone. |
| Dictée | Module Kotlin `PodunaSpeech` → correction locale → import | Tests JS et interface, cycle annulation/arrière-plan examiné. API native strictement locale, Android API ≥31 et moteur disponible ; langue actuellement `fr-FR`. Pas d’essai micro physique. |
| Navigation Produit / Scanner / Dictée | Une modale d’ajout, conservation des brouillons, activation des panneaux | Tests navigateur 320/390 px : parcours répétés, pied de page stable, défilement, hauteur réduite/restaurée. Le clavier natif est simulé par le changement de viewport. |
| Hors ligne, synchronisation, partage | SQLite + file d’opérations → `SyncEngine` → API signée → PostgreSQL | Tests des conflits, requêtes retardées, reconnexion, absence de synchro des listes locales, invitations/révocations et deux instances serveur. Pas deux téléphones réels. |
| Communauté et modération | Préférence personnelle / cache / catalogues / propositions communautaires ; API et administration | Tests de composants et PostgreSQL : contribution, consensus, confidentialité, signalement et décisions de modération. La disponibilité du serveur public n’a pas été testée. |
| Sauvegardes et thèmes | SQLite et préférences → JSON v2 ; import v1/v2 ; sélection/partage de fichiers natifs | Tests de validation, restauration transactionnelle et préférences existantes prioritaires. Le sélecteur Android de fichiers et SecureStore restent à valider sur appareil. |

Les tests de composants et les aperçus utilisent des doublures pour les API
natives. Les tests SQLite mobile utilisent SQL.js ; ceux du serveur utilisent
un vrai PostgreSQL temporaire. Aucun de ces résultats ne doit être présenté
comme une recette intégrale de l’APK installé.

## Résultats relancés sur cette référence

- TypeScript : aucune erreur.
- Vitest : **341 tests réussis**, 28 fichiers.
- Jest / composants React Native : **266 tests réussis**, 22 suites.
- Configuration de build et plugin dictée : **2 fichiers de tests réussis**.
- Trois parcours navigateur : courses, correction OCR, dictée/navigation,
  **réussis à 320 et 390 px**.
- Export Android Metro/Hermes : **réussi**, 1035 modules. Pas de build Gradle/APK.
- Rust : **57 tests standards réussis** ; tests optionnels exécutés séparément
  lorsque l’environnement isolé nécessaire était disponible.
- PostgreSQL : **12 tests d’intégration réussis** (partage, synchronisation,
  communauté, administration, sécurité et rôle SQL limité).
- Sauvegarde/restauration PostgreSQL : **4 tests réels réussis** sur bases jetables.
- OCR Python : **12 tests réussis**, moteur et modèles locaux inclus.
- Outils d’exploitation : **59 tests réussis / 4 ignorés** dans la suite générale
  (les 4 tests de restauration sont ensuite exécutés séparément) ; **4 tests
  supplémentaires réussis** pour la préparation du compte administrateur.

Les premiers essais Rust/GnuPG ont été bloqués par les permissions du bac à sable.
Ils ont été relancés avec autorisation, toujours avec services/trousseaux de test
isolés, et ont réussi. Il ne s’agissait pas d’échecs fonctionnels reproduits.
Redis/Vault réels, catalogues publics et recette Android/iOS n’ont pas été lancés.

## Points à traiter avant de déclarer une migration validée

### 1. Scénarios Android E2E en partie obsolètes

Constat statique, pas résultat d’une exécution Maestro :

- `mobile/e2e/android/offline-list.yaml` et `offline-recovery.yaml` cherchent
  `add-item-input` dès le lancement. L’application démarre maintenant sur
  « Mes listes » ; il faut ouvrir une liste, puis « Ajouter un article ».
- `offline-recovery.yaml` attend une synchronisation sur une liste sans préparer
  son activation ni un serveur de test, alors que les nouvelles listes sont locales.
- `camera-permission.yaml` revient de Scanner à Produit mais ne teste pas
  ensuite la fermeture complète et la réouverture de « Ajouter un article ».
  Précision ajoutée lors de la migration : ce premier retour conserve bien la
  modale ouverte ; le contrôle initial le décrivait à tort comme une fermeture.
- `.github/workflows/mobile-android-e2e.yml` utilise encore pnpm 10, contrairement
  aux tests mobile et à l’environnement actuel en 11.25.0. Il assemble une variante
  debug sans démarrer Metro : vérifier son démarrage autonome ou fournir Metro
  avant de considérer ce workflow comme une preuve d’intégration native.

Il faut remettre ces scénarios au niveau de l’interface actuelle et les exécuter
sur Android avant/après migration. Aucun scénario n’a été corrigé dans cet audit.

### 2. Stockage et identité : invariants à préserver

Lors de la future installation par-dessus l’application existante, conserver
le package `com.smartshopping.app`, la signature de l’APK, `smartshopping.db`,
les clés KV et les secrets SecureStore. Vérifier listes, opérations hors ligne,
thèmes, rayons mémorisés et accès aux listes partagées après mise à jour.

Attention à `LocalKeyValueStorage` : il choisit le stockage navigateur si
`globalThis.localStorage` existe. Un changement des globals fournis par React
Native pourrait changer le stockage sélectionné. C’est un point de compatibilité
à vérifier sur la version cible, pas un défaut reproduit sur la version actuelle.

Une branche Git protège les sources, **pas les données du téléphone ni les
secrets exclus du dépôt**. Prévoir une sauvegarde personnelle avant la recette ;
elle n’exporte volontairement pas les secrets ni les droits de partage.

### 3. Module natif et dépendances

Le module Kotlin et le plugin de permission micro doivent compiler et être
reconnus par l’autolinking avec le SDK cible. Refaire les refus de permission,
annulations, changement de panneau et passage en arrière-plan caméra/dictée.

L’export actuel garde un avertissement de résolution
`@noble/hashes/crypto.js` avec fallback : à réévaluer avec Metro cible.
Les **8 avis JavaScript et 1 avis Rust** du dernier audit restent documentés dans
[SECURITE_DEPENDANCES.md](SECURITE_DEPENDANCES.md) ; cet audit fonctionnel ne les
efface pas et ne remplace pas une nouvelle analyse après mise à jour.

## Conclusion et ordre de migration

La base fonctionnelle automatisée est verte ; aucune régression n’a été
reproduite dans les parcours exécutés. La couverture native doit être complétée,
notamment les scénarios E2E obsolètes et l’installation conservant les données.

1. Fiabiliser la recette Android de référence sur la branche dédiée.
2. Choisir le SDK stable cible et vérifier la compatibilité de tous les modules.
3. Migrer progressivement, sans toucher à la branche de référence.
4. Relancer ces contrôles, compiler un APK de test et l’installer par-dessus
   l’actuel sans désinstallation ; tester aussi une installation neuve isolée.
5. Ne fusionner/publier qu’après validation des fonctionnalités, des données et
   des alertes restantes. Aucune fusion ou publication n’est lancée par ce bilan.
