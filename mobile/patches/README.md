# Patchs locaux versionnés

## Sécurité des outils — 22 octobre 2026

`ip@1.1.9.patch`, `braces@3.0.3.patch`, `sprintf-js@1.0.3.patch` et
`node-forge@1.4.0.patch` sont des correctifs temporaires ciblés, pas des versions
officielles certifiées. Leur justification, leurs limites et les références
amont sont dans [SECURITE_DEPENDANCES.md](../../docs/SECURITE_DEPENDANCES.md).
Les alertes d'audit restent visibles : ne pas ajouter d'exemption pour les cacher.

Validation : `pnpm test:build-config` (tests des vrais consommateurs et des cas
de sécurité dans `config/security-patches.test.cjs`), `pnpm typecheck`,
`pnpm test`, `pnpm test:components` et export Android avec source map.
Les patchs ciblent les points d'entrée Node des outils ; ils ne doivent pas
être présentés comme des correctifs des bundles navigateur précompilés.

Maintenance : vérifier chaque nouvelle publication amont, retirer un patch
seulement après adoption d'une version corrigée et passage des régressions.
Adapter alors les tests qui épinglent son numéro de version/enregistrement,
en conservant les tests comportementaux. Ne pas activer `allowUnusedPatches`.

## Correctif Android expo-camera 58.0.11

`expo-camera@58.0.11.patch` limite l'abonnement à l'état de la caméra à la
durée de vie de sa vue. L'Activity Android survit aux changements d'onglet :
l'ancien abonnement pouvait donc réappliquer `enableTorch=true` à la
réouverture d'une autre vue caméra.

- Désabonnement avant une nouvelle liaison, à la sortie réelle de la fenêtre
  (`onDetachedFromWindow`) et à la destruction de la vue.
- Remise de `enableTorch` à `false` et du flash photo à `OFF`, arrêt de la mise
  au point et libération de l'aperçu, de l'analyseur et des références caméra.
- Réattachement avec lampe/flash éteints et nouvelle session. Les démarrages
  asynchrones et événements d'ouverture d'une ancienne session sont ignorés.
- La fermeture ne détache que les use cases appartenant à cette vue : une
  ancienne vue détruite tardivement ne doit pas arrêter la nouvelle caméra.
- Aucun retrait des abonnements appartenant aux autres vues.
- Aucun changement du moteur ML Kit ou de la validation des codes-barres.

Le correctif est enregistré dans `pnpm-workspace.yaml` et le lockfile. Ne pas
éditer uniquement `node_modules`. `expo.autolinking.android.buildFromSource`
dans `package.json` doit conserver `expo-camera` : sinon Expo embarque son AAR
précompilé, sans notre correctif. Les tests de configuration contrôlent cela.

Les trois tests Robolectric `CameraStateSubscriptionTest` sont inclus dans le
patch. Ils couvrent la fermeture/réouverture avec une ancienne préférence
de lampe allumée, le remplacement d'un abonnement et la préservation des
autres observateurs. Les tests du composant couvrent également la remise à
zéro de la lampe après démontage et passage en arrière-plan, en modes produit
et photo.

Quatre tests `CameraSessionTest` couvrent les démarrages interdits hors session,
la réouverture après une requête en attente, le remplacement d'une requête et
la destruction définitive. Les tests de configuration vérifient le raccordement
de ces protections aux callbacks de la vue native.

Validation locale : tâche `:expo-camera:testDebugUnitTest --tests
"expo.modules.camera.Camera*Test"` (7 tests), puis
`:expo-camera:compileReleaseKotlin`. Cette configuration expose les tests
unitaires sur la variante debug, pas sur release. Les deux compilations
et les tests doivent être revérifiés après chaque modification du patch.

Retour utilisateur : le correctif limité à la destruction, livré en 0.1.19,
ne suffisait pas. La révision avec détachement/réattachement reste à tester
sur le OnePlus 11 ; les tests locaux ne valident pas le comportement physique
de sa LED.

À chaque mise à jour d'expo-camera, vérifier si l'amont corrige ce cycle de
vie, puis réévaluer le patch et l'option `buildFromSource` ensemble. Ne pas
activer `allowUnusedPatches` pour masquer un correctif devenu incompatible.
