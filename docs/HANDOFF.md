# Poduna — reprise courte

Date : 2026-11-12. Auteur : Codex. Statut : appliqué ; mémoire AI-BRAIN enregistrée
avec autorisation utilisateur. Le code et les livrables restent dans ce dépôt.
Fiche mémoire : [Poduna](../../AI-BRAIN/03_PROJECTS/poduna/PROJECT.md).

## Dernière session — bloc-notes et contribution OCR préparée

- Retouche suivante du 12 novembre : noms cochés uniquement barrés, couleur
  normale conservée en classique/bloc-notes. TypeScript + 30 tests ciblés réussis,
  couvrant les sept thèmes et la décoche ; aucun APK généré.
- Retouche du 12 novembre : fond des titres de rayons transparent en bloc-notes,
  fond habituel conservé en vue classique. TypeScript + 7 tests (sept thèmes)
  réussis ; aucun APK généré pour cette retouche.
- Options de la liste : switches indépendants Bloc-notes/Afficher les rayons,
  propres à chaque liste/appareil. SQLite, export et restauration des copies inclus.
  Les anciennes sauvegardes restent lisibles ; aucun réglage envoyé aux membres.
- Bloc-notes : lignes compactes, cases et commandes conservées, couleurs et formes
  adaptées aux sept thèmes. Cibles tactiles ≥48 points ; rayons moins hauts.
- Dans les deux vues, cocher barre l’article **sans le déplacer** ; plus de groupe
  « Déjà pris » ni grand écran de fin qui décale la liste au dernier article.
- Aides « i » pour Liste de courses et Synchronisation, masquables comme les autres.
- Réglages → Amélioration OCR · aperçu : désactivé par défaut, activation explicite,
  puis aperçu photo recadrée/texte corrigé par capture. Envoi désactivé, aucune file
  ni copie persistante pour contribution, option exclue des sauvegardes. Ce choix
  **n’autorise pas un futur envoi**. Reconnaissance habituelle sur serveur inchangée.
- Validation : TypeScript, **483 Vitest + 348 Jest**, `git diff --check` ; aperçu
  fictif 390×844 et 320×568 (Origine/Contraste/Pixel, coche stable, contribution).
  Aucun APK, test physique Android, apprentissage OCR ou changement serveur.
- Suite : [recette prochain APK](APK_TEST_LOCAL.md) ; collecte/consentement réel,
  protection et durée de conservation à concevoir avant connexion, voir [OCR](../ops/OCR.md).

## 9 novembre — membres, contact et aperçu premium

- Membres : « Renommer » dans le partage, nom privé par appareil et par liste,
  conservé après redémarrage. Identité serveur inchangée ; noms exclus des exports.
- Aide « i » du partage conservée et enrichie ; même réglage de masquage.
- Contact accessible depuis Réglages et le pied de page : validation/aperçu,
  aucun envoi ni stockage permanent ; brouillon perdu à la fermeture.
- Réglages → Mode premium (test) : Minimal, Papier, Pastel, Pixel et nouvelles
  invitations réservés au mode actif. Origine/Nuit/Contraste, rejoindre une liste
  et gérer les partages existants restent gratuits. Retour gratuit → Origine si
  besoin, sans effacer le thème préféré. Simulation exclue des sauvegardes et
  ignorée en distribution store/direct, même si une ancienne valeur existe.
- Paiements, licences et contrôle des droits côté serveur **non implémentés**.
  Les choix gratuits et les noms privés sont des choix d’implémentation proposés,
  pas une tarification définitive. Voir [Monétisation](MONETISATION.md).
- Validation du 9 novembre : TypeScript, **479 Vitest + 334 Jest**, aperçu simulé
  390×844 (premium, renommage, aide, contact). Pas de test physique ni nouvel APK.
  La 0.1.23 ne contient aucun de ces changements. Serveur inchangé.

## Session précédente — aides compactes

- Instructions déplacées dans un « i » près de « Mes listes » et « Ajouter un
  article », avec contenu adapté à Produit, Code-barres, Liste écrite et Dicter.
- Extension du 9 novembre : même aide pour « Partager une liste », masquable
  par le même réglage. Consignes générales déplacées ; erreurs, code/expiration,
  avertissement de confiance et résultats des actions conservés. TypeScript et
  144 tests ciblés HomeScreen/ShareListCard réussis ; pas de nouvel APK.
- Réglages → Afficher les icônes d’aide : choix persistant, inclus dans les
  sauvegardes ; une restauration conserve le choix déjà présent sur l’appareil.
- Fenêtre défilante, fermeture explicite/retour Android, cible tactile 48 points.
  Caméra en pause et lampe éteinte pendant l’aide ; dictée interrompue, brouillon
  reconnu conservé. Erreurs, permissions et états opérationnels restent visibles.
- TypeScript, 466 tests Vitest et 318 tests composants réussis ; aperçu simulé
  vérifié en 390×844 et 320×568. Pas de test physique Android cette session.
- Code prêt pour le prochain APK : **la 0.1.23 existante ne contient pas ces aides**.
  Aucun nouvel APK, changement serveur, commit ou push effectué.
- Sources : `mobile/src/components/PageHelp.tsx`, `HomeScreen.tsx` dans
  `mobile/src/screens/`, `mobile/src/services/storage/interfaceSettings.ts`.

## Validation précédente — 8 novembre

Valider les derniers changements, produire l’APK 0.1.23 et éprouver le partage.
Branche `codex/stable-upgrade-preflight`, modifications préexistantes conservées.
Aucun commit, push, déploiement ou installation sur téléphone demandé/effectué.

## État

- Implémentés : commandes caméra par icônes, copie locale sans indicateur/sync
  après fin de partage, noms personnels séparés des lignes synchronisées,
  proposition unique du nom catalogue après nommage hors ligne, choix sauvegardés.
- Backend compilé ; tests PostgreSQL en bases jetables, dont deux identités,
  ajouts simultanés, retries, suppression/modification, retrait et nouveau partage.
- Mobile : deux bases SQLite isolées testées pour convergence, noms privés,
  conservation de la copie révoquée et reprise explicite.
- Validation : TypeScript, 818 tests mobiles/configuration, 58 tests Rust,
  13 tests PostgreSQL et 4 tests de restauration réussis. Les tests optionnels
  de services externes (catalogues réels, OCR, Redis, Vault) ne sont pas déclarés exécutés.
- APK 0.1.23 (code Android 24) prêt : `artifacts/android/poduna-0.1.23-preview.apk`.
  Signature identique à la 0.1.22, SHA-256 et constructeurs ML Kit vérifiés ;
  callbacks natifs caméra présents. Voir `APK_TEST_LOCAL.md` pour la recette.
- Aucun téléphone connecté ni émulateur installé : pas de recette physique
  à deux installations. Les tests automatisés ne la remplacent pas.
- Serveur/tunnel existants non relancés. Le lanceur garde son ancien binaire
  par défaut : utiliser explicitement le nouveau binaire au prochain démarrage
  approuvé, ne pas écraser la configuration ou arrêter une session à l’aveugle.

## Outils locaux retrouvés

Rust n’était pas absent : il était hors PATH. Répertoire de référence :
`../2026-09-15/prior-conversation-with-codex-conversation-role/work/`.

- Rust : `rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/` ; cache `cargo/`.
- PostgreSQL : `postgres/runtime/bin/`.
- Binaire actuel : `.local-dev/security-tools/backend-target/debug/shopping-list-backend`.
- Pour les commandes Cargo : PATH Rust ci-dessus, CARGO_HOME vers ce cache,
  CARGO_TARGET_DIR vers `.local-dev/security-tools/backend-target` (chemins absolus).
- Tests : `cargo test --locked --offline --manifest-path backend/Cargo.toml` ;
  `python3 ops/test-backend-postgres.py --backups` avec PODUNA_TEST_PG_BIN renseigné.
- Relance future : PODUNA_BACKEND_BIN doit désigner le binaire actuel avant
  `python3 ops/local-https.py`. Cela ne remplace pas un backend déjà en cours.

## Décisions et suite

- Stockage listes/produits conservé ; aucune migration générale vers JSON.
- Auth admin : choix Authelia/Cloudflare/système actuel encore ouvert ; aucune
  migration décidée. Pas de compte admin configuré selon l’utilisateur.
- Préparer l’essai du nouvel APK, puis les parcours partagés sur deux appareils.
- Poduna enregistré dans `../AI-BRAIN/03_PROJECTS/poduna/` (depuis la racine
  du dépôt) : état, tâches, décisions et passation, sans copie du projet.
  L’utilisateur autorise la mise à jour de cette mémoire ; vérifier les droits
  techniques à chaque session. Les détails techniques restent dans ce dépôt.
- Les anciennes feuilles de route contiennent des états historiques périmés :
  recouper avec le code, `APK_TEST_LOCAL.md` et `ADMINISTRATION.md`.
