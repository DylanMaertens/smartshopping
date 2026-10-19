# Entretien et classement du projet

Audit du 15 octobre 2026. Le suivi fonctionnel reste dans [COMPTE_RENDU.html](../COMPTE_RENDU.html).

## Nettoyage réalisé

100 cibles locales (fichiers et dossiers), totalisant **3 472 222 397 octets**
de contenu, ont été déplacées avec `gio trash` dans la corbeille système.
Ce sont environ **3,47 Go / 3,23 Gio retirés des dossiers actifs**, pas de l’espace
disque libéré : les données restent récupérables tant que la corbeille n’est pas vidée.

| Éléments retirés des dossiers actifs | Pourquoi |
| --- | --- |
| 13 anciens APK et leurs empreintes, versions 0.1.0–0.1.10 et 0.1.12–0.1.13 | Versions remplacées ; 0.1.11, 0.1.14 et 0.1.15 conservées. |
| 3 anciennes copies APK et leurs empreintes dans `web/dist/downloads/` | Le site propose uniquement la 0.1.11. |
| `mobile/android/app/build/` | Résultats de compilation régénérables ; projet Android, configuration et signature conservés. |
| `backend/target/debug/incremental/` | Cache incrémental Rust ; exécutables et autres dépendances compilées conservés. |
| `cmdline.zip` et `jdk.tar.gz` dans `.local-dev/android-build/downloads/` | Archives d’installation déjà extraites ; SDK et Java opérationnels conservés. |
| `mobile/.preview/` et 61 captures PNG de `web/.qa/` | Sorties des scripts de test ; les 3 captures liées au rapport HTML restent en place. |
| `ops/__pycache__/` et `backend/ocr/__pycache__/` | Bytecode Python régénérable. |

Le [journal local détaillé](../.local-dev/cleanup/2026-10-15.json) donne les chemins
exacts et volumes de chaque cible ; il est exclu de Git et propre à ce poste.

### Code et documentation

- Suppression de `mobile/src/services/cache/mmkvCache.ts` : aucun import ni référence
  active ; `services/api/backend.ts` utilise `sqliteProductCache.ts`. Aucun stockage
  ni donnée utilisateur modifié. Le fichier retiré reste récupérable dans Git.
- Déplacement de l’ancien `COMPTE_RENDU.md` vers
  [l’archive du compte rendu initial](archives/COMPTE_RENDU_INITIAL.md), avec un
  avertissement historique. Il décrit notamment MMKV, remplacé depuis.
- Liens de téléchargement des versions retirées remplacés par des mentions
  historiques dans la documentation et le rapport ; les empreintes historiques restent documentées.

## Ce qui reste utile

| Dossier / fichier | Usage et précautions |
| --- | --- |
| `mobile/src/`, `backend/src/`, tests et migrations | Sources actives. Une migration ancienne reste nécessaire pour créer ou mettre à niveau une base. |
| `web/dist/` | Malgré son nom, contient les sources du site statique : ne pas le traiter comme un dossier de compilation jetable. |
| `backend/public/` et `backend/admin/` | Assets intégrés au binaire Rust. Les copies synchronisées avec le site sont nécessaires au contexte Docker et aux `include_str!`/`include_bytes!`. |
| `output/branding/poduna/v1/` | Kit source du logo et des icônes, lu par `ops/sync-brand-assets.mjs`. |
| `output/imagegen/` | Historique de création et référence du logo retenu. Faible volume ; conservé comme provenance, pas comme code actif. |
| `.local-dev/android-build/signing/` | Clé privée indispensable pour mettre à jour les APK existants. Sauvegarde externe sécurisée à prévoir, jamais de nettoyage automatique. |
| `.local-dev/postgres/`, secrets, `.env`, identités, configuration du tunnel | Données ou configuration locales, pas des caches jetables. |
| `.local-dev/android-build/sdk/`, Java, caches Gradle, `node_modules/` | Outillage et dépendances utiles aux prochains builds. Les retirer impose une réinstallation ou une recompilation plus coûteuse. |
| `.local-dev/ocr/`, navigateurs Playwright | Modèles et environnements nécessaires à l’OCR ou aux tests. Conservés même s’ils ne sont pas chargés au démarrage de l’app. |
| `ops/`, `observability/`, `beta/`, `.github/` | Exploitation, sécurité, sauvegardes, préparation VPS et validation. Le fait qu’un script ne soit pas importé par l’app ne signifie pas qu’il est inutile. |
| `artifacts/android/` | 0.1.15 pour les essais, 0.1.14 pour revenir en arrière, 0.1.11 pour reproduire le téléchargement du site. |

## Récupérer ou régénérer

- Ouvrir la **Corbeille** du gestionnaire de fichiers et restaurer l’élément à son
  emplacement d’origine. Le journal local permet de retrouver les noms exacts.
  Si un dossier a depuis été recréé par un build, ne pas l’écraser : restaurer ailleurs
  et comparer d’abord.
- Les intermédiaires Android reviennent au prochain `bash ops/build-preview-apk.sh`.
  Le cache Rust revient aux prochaines compilations ; la première peut être plus lente.
- L’aperçu mobile se relance avec `cd mobile && pnpm preview:ui` ;
  les scripts `mobile/preview/check-*.mjs` et
  `web/scripts/check-*.mjs` recréent leurs sorties visuelles.
- `node web/scripts/prepare-download.mjs` recrée la copie du téléchargement **0.1.11**
  depuis l’artefact conservé, après contrôle de l’empreinte.
- Aucun service, base ou tunnel n’a été redémarré ; aucun nouvel APK n’a été construit.

## Vérifications après nettoyage

- TypeScript et **625 tests réussis** : 337 Vitest, 264 composants Jest, 24 contrôles
  de configuration. Le code restant ne dépend pas de l’ancien cache supprimé.
- Synchronisation des assets backend/site contrôlée en lecture seule (`--check`).
- Téléchargement 0.1.11 re-préparé avec empreinte vérifiée, sans changement de version.
- Présence des trois APK conservés, clé de signature, Java, SDK, dépendances et base
  locale vérifiée sans lire les secrets ; liens actifs APK/captures/docs du rapport vérifiés.
- Syntaxe du lanceur APK et absence d’erreurs de whitespace dans le diff contrôlées.
- Pas de rebuild Android ni Rust pour ce ménage ; les caches supprimés ne sont
  volontairement pas recréés par une compilation de validation.

## Règle pour les prochains nettoyages

Garder la dernière version testée, une version de retour arrière et toute version
encore référencée par le site. Vérifier les références avant de retirer les autres
binaires ou captures. Ne pas nettoyer pendant une compilation ou un aperçu actif.
Conserver les sources de marque, migrations, données et clés même si elles sont anciennes.
L’audit ne permet pas de garantir qu’un élément ne servira « jamais » : les archives
et les scripts d’exploitation sont donc distingués du code réellement abandonné.
