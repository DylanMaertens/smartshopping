# Dépendances : correctifs et risques résiduels

État JavaScript et garde du graphe Rust vérifiés le **22 octobre 2026** ;
audits Rust/OCR-Python complets du 21 octobre. Ce document complète
[la sécurité d’exploitation](SECURITE_EXPLOITATION.md). Il décrit le code local,
pas un déploiement effectué sur le serveur ni un nouvel APK de distribution.

## Résultat des audits

Le **22 octobre**, ajout de patchs locaux pour les quatre avis JavaScript
résiduels (voir ci-dessous). Le nouvel audit a aussi signalé deux avis sur
`@vitest/mocker` : passage de Vitest **4.1.11 à 4.1.12** et de ses paquets
compagnons pour utiliser les correctifs officiels, sans passer à Vitest 5.
[Injection dans les mocks](https://github.com/advisories/GHSA-qxg6-89mg-rqv8),
[contournement Windows](https://github.com/advisories/GHSA-xp26-3454-mjgp).

**Les patchs ne changent pas le numéro de version amont : les quatre alertes
restent visibles dans l'audit.** Un test de régression local ne constitue ni
une validation par l'éditeur ni une garantie contre toutes les variantes.

Historique du lot du 21 octobre :

| Périmètre | Nouvel audit du 21 octobre, avant ce lot | Après ce lot |
| --- | --- | --- |
| JavaScript, développement compris | 11 avis : 4 élevés, 6 modérés, 1 faible | 4 avis : 3 élevés, 1 modéré, aucun critique |
| Rust, lockfile complet | 3 avis, aucun avertissement | 1 avis, aucun avertissement |
| OCR/Python, 25 versions épinglées | 9 avis sur certifi et Pillow | Aucun avis connu signalé |

Historique : 97 avis JavaScript le 16 octobre, puis 6 après la migration du
20 octobre ; 12 avis Rust et 2 avertissements au premier audit. Les nouveaux
avis expliquent la remontée avant ce lot : un résultat vert ne reste pas acquis.

Ces nombres sont ceux des outils, pas un décompte de failles exploitables dans
l’application. Ils peuvent changer avec la publication de nouveaux avis.
Les audits JavaScript et Rust restent **en échec**, volontairement : aucune exception, aucun
abaissement de seuil ni `continue-on-error` n’a été ajouté à la CI.

## Correctifs appliqués

### Patchs temporaires du 22 octobre

Enregistrés dans `mobile/patches`, `pnpm-workspace.yaml` et le lockfile avec
empreintes, appliqués automatiquement par pnpm même avec `--ignore-scripts`.
Ils ciblent les points d'entrée Node utilisés par les outils du projet,
pas des distributions navigateur autonomes de ces bibliothèques.

- `ip@1.1.9` : normalisation avant classement (formes IPv4 abrégées,
  octales/hexadécimales, IPv6 développées/compressées et IPv4 encapsulées).
  Les entrées invalides ne sont plus classées publiques ; les réseaux spéciaux
  sont traités de manière conservatrice. La sélection d'interface Hermes et
  les opérations de sous-réseau restent testées. Ce n'est **pas** une protection
  SSRF complète : DNS, redirections, proxies et politique réseau restent séparés.
- `node-forge@1.4.0` : contrôle du nombre d'éléments du `DigestAlgorithm`
  imbriqué, selon le correctif proposé dans la
  [PR amont #1152, encore ouverte lors de la vérification](https://github.com/digitalbazaar/forge/pull/1152).
  Vérification supplémentaire d'un paramètre NULL vide. Pas de modification
  des opérations RSA elles-mêmes. Tests de signatures malformées avec clé
  éphémère à exposant 3, signatures valides et certificat/signature Expo.
- `braces@3.0.3` : limite à 100 niveaux de blocs lors de l'analyse, y compris
  les parenthèses ; gardes dans les parcours d'AST fournis directement.
  Un motif trop profond provoque une `SyntaxError` explicite, et non un
  épuisement de pile. Les appelants doivent toujours gérer les erreurs ; ceci
  ne rend pas sûrs tous les motifs arbitraires ni toutes les expansions.
- `sprintf-js@1.0.3` : précision numérique bornée à 0–100 (1–100 pour `%g`),
  sans exception native pour `%.101f`, `%.101e`, `%.101g` ou `%.0g`.
  Les précisions excessives sont ramenées à la borne, les formats normaux et
  les précisions de chaînes restent inchangés. Aucun changement aux autres
  erreurs de format ou aux limites générales de taille des sorties.

Les 11 nouveaux tests sont dans `mobile/config/security-patches.test.cjs` et
exécutés par `test:build-config`, donc aussi dans la CI mobile. Les cas ciblés
échouaient avant installation des patchs ; ils passent après installation.
Les tests utilisent les dépendances résolues par les vrais consommateurs
(Hermes, Metro, instrumentation Jest et signature Expo), pas des doublures.

Pour Rust : **pas de correctif cryptographique maison**. Le nouveau contrôle
`ops/check-backend-crypto.py` échoue si `rsa` ou `sqlx-mysql` apparaissent dans
les dépendances actives normales/de build de la cible de déploiement. Il
échoue aussi si Cargo échoue ou ne retourne pas le graphe attendu. Ajouté à
la CI sécurité, avec cinq tests. Il ne remplace pas `cargo audit` et ne fait
pas disparaître RUSTSEC-2023-0071 du lockfile. Les fonctionnalités non standard
doivent faire l'objet d'un contrôle distinct avant activation.

### Mises à jour du 21 octobre

Lot du 21 octobre :

- Vite **7.3.6 → 7.3.7** : cinq avis retirés, via une contrainte limitée à la
  branche 7. Utilisé par Vitest, pas par l'application Android exportée.
  [Avis incluant les versions corrigées](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- `fast-xml-parser` **4.5.6 → 5.11.2**, uniquement sous les CLI Android/iOS
  12.1.1 ; `uuid` **7.0.3 → 11.1.1**, uniquement sous `xcode@3.0.1`.
  Ces passages majeurs sont ciblés et testés via les vrais consommateurs :
  détection d'activité Android, attributs XML, lecture d'un schéma Xcode,
  génération d'identifiants Xcode et contrôle des buffers UUID v5.
  [Avis XML](https://github.com/advisories/GHSA-gh4j-gqv2-49f6),
  [correctif UUID 11.1.1](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).
- Rust : `rustls-webpki` **0.103.15 → 0.103.16**, `webpki-roots` **1.0.7 →
  1.0.10**. Correctifs du rejet de certificats intermédiaires compromis et du
  magasin de confiance emSign ; le paquet de compatibilité `webpki-roots`
  0.26.11 réexporte bien la nouvelle version 1.x.
  [RustSec webpki](https://rustsec.org/advisories/RUSTSEC-2026-0382.html),
  [RustSec roots](https://rustsec.org/advisories/RUSTSEC-2026-0381.html).
- OCR : `certifi` **2026.7.22 → 2026.10.19**, Pillow **12.3.0 → 13.0.0**.
  `Image.open` limite maintenant les décodeurs à JPEG/PNG avant toute analyse
  du fichier, au lieu de ne vérifier le format qu'après ouverture. Les contrôles
  de dimensions, de taille et de durée restent en place. Les avis Pillow
  concernent notamment TIFF, GIF, PDF et EPS : leur présence ne prouvait pas
  leur exploitation par la route OCR, mais les bibliothèques sont corrigées.
  [Certifi](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2),
  [Pillow 13](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html).

Versions Expo, React Native, React et patch caméra inchangés. Aucun nouveau
script d'installation autorisé, aucune exception d'audit ajoutée. Les nouvelles
dépendances OCR sont testées dans un environnement séparé : le serveur local
en fonctionnement et son environnement Python n'ont **pas** été mis à jour.
Il faudra installer les exigences corrigées et reconstruire/redémarrer le
backend lors d'une mise à jour explicitement autorisée. Aucun nouvel APK ici.

Lots précédents :

- Rust : `crossbeam-epoch` 0.9.20, `h2` 0.4.16, `quinn-proto` 0.11.18,
  `rustls` 0.23.46 / `rustls-webpki` 0.103.15, `anyhow` 1.0.103,
  `event-listener` 5.4.2, avec leurs dépendances résolues dans `backend/Cargo.lock`.
- JavaScript : versions corrigées de `tar`, `shell-quote`, `undici`, `postcss`,
  `js-yaml`, `brace-expansion`, `nanoid`, `browserslist`, `@xmldom/xmldom`,
  `fast-uri`, `joi`, `baseline-browser-mapping`, `source-map-js`, `compression`.
  Les contraintes dans `mobile/pnpm-workspace.yaml` ciblent les anciennes
  versions d’une même branche d’API. Elles ne remplacent pas globalement une
  bibliothèque CommonJS par sa dernière version majeure.
- Vitest 3.2.7 → 4.1.11 : retrait de l’ancien `tinypool` vulnérable et mise à jour
  du moteur de tests. Les types Node, auparavant apportés implicitement, sont
  déclarés explicitement ; le test de catégorisation utilise l’URL Node pour
  lire sa fixture. Aucun changement de comportement de l’application associé.
- Après le premier lot de correctifs, migration vers Expo **58.0.16**,
  React Native **0.88.0** et React **19.3.0** sur une branche dédiée.
  La nouvelle chaîne Metro retire les deux avis `image-size`, faisant passer
  le total JavaScript de 8 à 6. Voir [le bilan de migration](MIGRATION_EXPO_58.md).

Les overrides sont temporaires : les réévaluer à chaque mise à jour de la
chaîne Expo/React Native, puis les retirer lorsque les parents résolvent
nativement des versions corrigées. Ne pas utiliser `audit --fix --force`.

## Les 4 avis JavaScript encore présents

Les chemins ci-dessous sont des exemples, pas une preuve d’absence d’autres
usages. Le lockfile contient aussi les outils de développement ; l’option
`--prod` ne suffit pas à isoler le code réellement embarqué par Metro.

| Paquet / avis | Chemin identifié et suite à donner |
| --- | --- |
| `ip`, [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) | CLI React Native (doctor / Hermes). Patch local de classement du 22 octobre ; ne pas s’en servir comme barrière SSRF. |
| `node-forge`, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `@expo/code-signing-certificates`. Patch local de validation ASN.1 du 22 octobre ; suivre la publication amont. |
| `braces`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `micromatch`, notamment Metro file-map. Gardes de profondeur locales ; conserver la gestion des erreurs et ne pas accepter de motifs non fiables. |
| `sprintf-js`, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | `js-yaml` 3 → `argparse`, outils CLI/tests. Patch local de précision du 22 octobre ; formats normaux inchangés. |

En attendant : ne pas exposer Metro, Vitest ou les outils de développement sur
Internet ; ne pas traiter des projets/assets/configurations non fiables dans
un environnement contenant des secrets. Ce sont des réductions d’exposition,
complémentaires aux patchs locaux ci-dessus.

### Exposition de l'application Android

Export **preview release Hermes**, sans mode développement, avec source map :
1 110 modules assemblés et 1 093 sources référencées. Aucun module de `ip`,
`node-forge`, `braces` ou `sprintf-js` n'est présent dans cette carte. Même
constat pour Vite, XML et UUID. Cela documente leur absence dans le JavaScript
Android de cet export, **pas** l'absence de vulnérabilités dans tout l'APK.
Les bibliothèques Gradle/natives et les outils du PC demandent leurs propres
contrôles. La carte n'est pas publiée : elle contient les sources du projet.

Le contrôle reproductible `ops/check-mobile-bundle-audit.mjs` échoue si un
paquet signalé apparaît dans la carte, ou si le rapport/la carte est invalide.
Il ne remplace ni ne neutralise l'audit de dépendances. Il dispose de tests
sur cartes simples/indexées, paquet scoped et erreurs d'audit.

## Avis Rust restant : `rsa` 0.9.10

[RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html)
concerne une attaque temporelle sur RSA ; aucun correctif n’est annoncé.
Le paquet est dans le lockfile via le pilote optionnel SQLx/MySQL. Le backend
active PostgreSQL avec les fonctionnalités par défaut de SQLx désactivées.

La vérification suivante ne trouve **aucune dépendance inverse active** sur la
cible Linux testée, avec les fonctionnalités actuelles :

```sh
cargo tree --locked --manifest-path backend/Cargo.toml --target x86_64-unknown-linux-gnu -i rsa
```

Ce résultat n’est pas une garantie pour d’autres cibles/fonctionnalités. Refaire
le contrôle avant tout changement SQLx, MySQL ou authentification RSA. L’avis
reste visible dans `cargo audit` : aucune suppression manuelle du lockfile et
aucune règle d’ignorance.

Contrôle relancé le 21 octobre après les deux correctifs TLS : toujours aucune
dépendance inverse active pour `rsa` sur `x86_64-unknown-linux-gnu`. Les deux
nouveaux avis TLS ont disparu ; seul RUSTSEC-2023-0071 reste dans le lockfile.
Le garde automatisé du 22 octobre confirme également l'absence de RSA et
SQLx/MySQL dans le graphe actif Linux avec les fonctionnalités par défaut.

## Vérification reproductible

Lot du 22 octobre : tests ciblés et de configuration **43/43**, garde Rust
**5/5** et contrôle réel Linux réussis. TypeScript, **384 tests Vitest**,
**278 tests Jest** et export Android Hermes vérifiés après les patchs.
Pas de nouvel APK, aucun redémarrage ou déploiement serveur, aucune modification
des données, identifiants, clés réelles ou règles d'ignorance des audits.

Résultats du lot du 21 octobre :

- installation pnpm figée, sans scripts : réussie ;
- TypeScript, **384 tests Vitest**, **278 tests Jest**, **32 tests de configuration**
  répartis dans cinq fichiers : réussis ;
- export Android Metro/Hermes et contrôle de la source map : réussis ;
- OCR : installation isolée, `pip check`, **13 tests réussis**, dont le moteur
  réel sur une image synthétique à deux colonnes avec les modèles locaux ;
- backend : compilation et **57 tests Rust standards réussis**, 16 tests
  nécessitant PostgreSQL/Redis/Vault ou une configuration externe ignorés ;
- audits : 4 avis JS, 1 Rust, 0 Python après correction ; aucun avis masqué.

Les nouveaux tests exécutant un sous-processus Node ont nécessité une relance
hors du bac à sable local (capture bloquée avec EPERM) ; les 32 tests passent
avec cette autorisation. Aucun changement des règles du projet pour les ignorer.
Pas de nouvelle exécution PostgreSQL/Redis/Vault ni de compilation APK/iOS
dans ce lot. L'avertissement Metro `@noble/hashes/crypto.js` reste inchangé.

Historique des résultats locaux des 19–20 octobre (mobile relancé après migration ; backend
inchangé, résultats de référence du 19 octobre) :

- installation figée sans scripts de paquets : réussie ;
- TypeScript : réussi ; 344 tests Vitest et 266 tests de composants Jest réussis ;
- 2 fichiers de tests de configuration/build : réussis ;
- tests Rust standards et compilation des binaires : réussis ;
- 12 tests PostgreSQL sur base éphémère : réussis ;
- parcours HTTPS contact/admin/sécurité à 320, 390, 768 et 1440 px : réussis,
  y compris blocage/déblocage signé, annulation, essais XSS et taille de texte à 200 % ;
- export Android Metro/Hermes : réussi, 1109 modules. Avertissement de résolution
  de sous-chemin `@noble/hashes/crypto.js` avec fallback conservé ; pas d’échec de
  compilation, mais cet avertissement reste à traiter séparément ;
- Expo Doctor : 20/20 ; compilations natives Android arm64 debug et release
  optimisée : réussies, avec signature debug de validation uniquement ;
- `git diff --check` : réussi.

```sh
pnpm --dir mobile install --frozen-lockfile --ignore-scripts
pnpm --dir mobile typecheck
pnpm --dir mobile test
pnpm --dir mobile test:components --silent
pnpm --dir mobile test:build-config
python3 -m unittest discover -s ops/tests -p 'test_backend_crypto_guard.py'
python3 ops/check-backend-crypto.py --target x86_64-unknown-linux-gnu
pnpm --dir mobile audit --audit-level low
cargo test --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock --deny warnings
python -m pip_audit --requirement backend/ocr/requirements.txt --no-deps --disable-pip
python3 ops/test-backend-postgres.py --browser
```

Pour vérifier l'exposition du bundle après un nouvel export :

```sh
pnpm --dir mobile audit --json > /tmp/poduna-audit.json
# Le code non nul de l'audit est attendu tant que les avis restent présents.
cd mobile
SMARTSHOPPING_CHANNEL=preview SMARTSHOPPING_TEST_SERVER=true pnpm exec expo export --platform android --source-maps --output-dir /tmp/poduna-security-export
cd ..
# Remplacer le chemin par celui de la carte générée par cet export.
node ops/check-mobile-bundle-audit.mjs /tmp/poduna-audit.json '/tmp/poduna-security-export/_expo/static/js/android/index-<hash>.hbc.map'
```

Le dernier test nécessite PostgreSQL et Playwright configurés comme décrit dans
[ADMINISTRATION.md](ADMINISTRATION.md), et utilise uniquement des données
temporaires. Les deux commandes d’audit ci-dessus doivent encore retourner un
code non nul tant que les avis résiduels subsistent.

Contrôles complémentaires : export Metro/Hermes Android, builds Gradle debug/release,
compilation des binaires Rust et installation avec lockfile figé. Ces contrôles
ne remplacent pas un test sur téléphone. Les dépendances Gradle et les
paquets système Docker ne sont pas couverts par les deux audits ci-dessus.

Références techniques : [migration Vitest 4](https://v4.vitest.dev/guide/migration.html),
[ruptures d’API image-size 2](https://github.com/image-size/image-size/releases/tag/v2.0.0).
