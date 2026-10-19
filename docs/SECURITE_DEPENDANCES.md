# Dépendances : correctifs et risques résiduels

État vérifié le **19 octobre 2026**. Ce document complète
[la sécurité d’exploitation](SECURITE_EXPLOITATION.md). Il décrit le code local,
pas un déploiement effectué sur le serveur ni un nouvel APK.

## Résultat des audits

| Périmètre | Avant, 16 octobre | Après, 19 octobre |
| --- | --- | --- |
| JavaScript, développement compris | 97 avis : 4 critiques, 63 élevés, 25 modérés, 5 faibles | 8 avis : 5 élevés, 3 modérés, **aucun critique** |
| Rust, lockfile complet | 12 avis + 2 avertissements | 1 avis, aucun avertissement |

Ces nombres sont ceux des outils, pas un décompte de failles exploitables dans
l’application. Ils peuvent changer avec la publication de nouveaux avis.
Les audits restent **en échec**, volontairement : aucune exception, aucun
abaissement de seuil ni `continue-on-error` n’a été ajouté à la CI.

## Correctifs appliqués

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
- Expo **54.0.37**, React Native **0.81.5** et React **19.1.0** restent inchangés.

Les overrides sont temporaires : les réévaluer à chaque mise à jour de la
chaîne Expo/React Native, puis les retirer lorsque les parents résolvent
nativement des versions corrigées. Ne pas utiliser `audit --fix --force`.

## Les 8 avis JavaScript encore présents

Les chemins ci-dessous sont des exemples, pas une preuve d’absence d’autres
usages. Le lockfile contient aussi les outils de développement ; l’option
`--prod` ne suffit pas à isoler le code réellement embarqué par Metro.

| Paquet / avis | Chemin identifié et suite à donner |
| --- | --- |
| `ip`, [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) | CLI React Native (doctor / Hermes). Pas de version corrigée annoncée par l’audit. Remplacer le parent ou la bibliothèque ; ne pas s’en servir comme barrière SSRF. |
| `image-size`, [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | Metro utilise 1.2.1 ; correctif ≥2.0.3. Metro appelle encore l’API synchrone avec un chemin de fichier, supprimée en v2 : un override seul casserait le traitement des assets. Prévoir mise à jour compatible de Metro ou correctif ciblé testé. |
| `node-forge`, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `@expo/code-signing-certificates`. Pas de version corrigée annoncée par l’audit ; suivre le correctif du paquet/parent. |
| `braces`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `micromatch`, notamment Metro file-map. Pas de version corrigée annoncée par l’audit ; ne pas accepter de motifs fournis par un tiers non fiable dans ces outils. |
| `fast-xml-parser`, [GHSA-gh4j-gqv2-49f6](https://github.com/advisories/GHSA-gh4j-gqv2-49f6) | CLI Android/iOS, version 4.5.6 ; correctif ≥5.7.0. Migration majeure à tester sur les manifestes Android et schémas Xcode avant remplacement. |
| `uuid`, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `xcode` → uuid 7.0.3 ; correctif ≥11.1.1. L’usage relevé dans `pbxProject.js` est `v4()` sans buffer, contrairement aux API v3/v5/v6 concernées par l’avis. Cela ne vaut pas exemption pour tout le graphe ; tester la génération des projets avant migration majeure. |
| `sprintf-js`, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | `js-yaml` 3 → `argparse`, outils CLI/tests. Pas de version corrigée annoncée par l’audit ; remplacer le parent ou attendre un correctif. |

En attendant : ne pas exposer Metro, Vitest ou les outils de développement sur
Internet ; ne pas traiter des projets/assets/configurations non fiables dans
un environnement contenant des secrets. Ce sont des réductions d’exposition,
pas des corrections des bibliothèques.

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

## Vérification reproductible

Résultats locaux du 19 octobre :

- installation figée sans scripts de paquets : réussie ;
- TypeScript : réussi ; 341 tests Vitest et 266 tests de composants Jest réussis ;
- 2 fichiers de tests de configuration/build : réussis ;
- tests Rust standards et compilation des binaires : réussis ;
- 12 tests PostgreSQL sur base éphémère : réussis ;
- parcours HTTPS contact/admin/sécurité à 320, 390, 768 et 1440 px : réussis,
  y compris blocage/déblocage signé, annulation, essais XSS et taille de texte à 200 % ;
- export Android Metro/Hermes : réussi, 1035 modules. Avertissement de résolution
  de sous-chemin `@noble/hashes/crypto.js` avec fallback conservé ; pas d’échec de
  compilation, mais cet avertissement reste à traiter séparément ;
- `git diff --check` : réussi.

```sh
pnpm --dir mobile install --frozen-lockfile --ignore-scripts
pnpm --dir mobile typecheck
pnpm --dir mobile test
pnpm --dir mobile test:components --silent
pnpm --dir mobile test:build-config
pnpm --dir mobile audit --audit-level low
cargo test --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock --deny warnings
python3 ops/test-backend-postgres.py --browser
```

Le dernier test nécessite PostgreSQL et Playwright configurés comme décrit dans
[ADMINISTRATION.md](ADMINISTRATION.md), et utilise uniquement des données
temporaires. Les deux commandes d’audit ci-dessus doivent encore retourner un
code non nul tant que les avis résiduels subsistent.

Contrôles complémentaires : export Metro/Hermes Android sans APK, compilation
des binaires Rust et installation avec lockfile figé. L’export ne remplace pas
un build natif Gradle ni un test sur téléphone. Les dépendances Gradle et les
paquets système Docker ne sont pas couverts par les deux audits ci-dessus.

Références techniques : [migration Vitest 4](https://v4.vitest.dev/guide/migration.html),
[ruptures d’API image-size 2](https://github.com/image-size/image-size/releases/tag/v2.0.0).
