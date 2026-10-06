# Scan et recherche de produits — APK 0.1.6

## Nouveautés 0.1.6

- **Alcools** : 29e rayon, avec vins, bières, cidres et spiritueux. Classement par catégories des API et par nom ; boissons explicitement sans alcool maintenues dans Boissons. Les produits déjà enregistrés gardent leur affectation ; le choix manuel reste possible. Les préférences de tri existantes sont conservées et le rayon est ajouté à leur suite.
- **Nommer le produit** : après un scan sans nom récupérable (absence du catalogue ou indisponibilité), une fenêtre propose de saisir le nom ou de choisir Plus tard. Le scanner est mis en pause pendant cette fenêtre puis reprend, sans fermeture de la session. Les réponses de recherches déjà en cours sont proposées une par une. Le nom enregistré et son rayon sont mémorisés sur ce téléphone.
- **Notifications** : disparition après **2,5 secondes**, renouvelée à chaque ajout, même identique. La proposition de nommer ne disparaît pas avec la notification.

## Lectures de la caméra

Le scanner reste ouvert. Un produit n’est accepté qu’après au moins deux lectures concordantes espacées de 250 ms, sans interruption supérieure à une seconde. Les codes EAN/UPC doivent avoir un chiffre de contrôle valide. Les représentations UPC-A et EAN-13 du même produit sont normalisées ; UPC-E est développé avant la recherche.

Après un ajout, une pause de **1,5 seconde** bloque toutes les nouvelles lectures. Le même code ne se réajoute pas automatiquement en restant dans le cadre. Le bouton **Ajouter encore ce produit**, disponible après la pause, augmente volontairement la quantité. Ces contrôles réduisent les erreurs de lecture sans garantir qu’aucun autre code valide ne puisse être reconnu par la caméra.

## Recherche séquentielle

Avant la recherche, un nom personnalisé enregistré sur ce téléphone est réutilisé immédiatement avec son rayon, même hors ligne. Ces préférences n’expirent pas avec le cache produit et restent présentes après suppression de l’article ou de sa liste. Elles sont locales à cet appareil ; elles ne font pas partie du fichier de sauvegarde des listes. Les articles des listes partagées continuent à synchroniser leur nom normalement.

1. Cache SQLite du téléphone (persistant, expiration après 7 jours).
2. Cache du serveur (mémoire, puis Redis si configuré).
3. Open Food Facts.
4. Open Products Facts.
5. Open Beauty Facts.
6. Open Pet Food Facts.

La recherche s’arrête au premier produit exploitable : réponse positive, nom non vide (français préféré), code correspondant lorsqu’il est présent. Une fiche sans nom, une absence ou un code différent fait poursuivre la recherche. Une erreur réseau, HTTP ou de décodage fait également passer au catalogue suivant. Les requêtes demandent uniquement les champs utilisés par l’app ; les redirections automatiques entre catalogues sont désactivées pour respecter cet ordre.

Chaque catalogue dispose de 4 secondes au maximum, tentatives et attente de quota comprises. Le téléphone attend jusqu’à 22 secondes au total, y compris son authentification. La liste reste utilisable pendant l’enrichissement. Si aucun catalogue ne trouve le produit, l’article provisoire reste dans la liste pour être nommé manuellement ; ni absence ni panne n’est enregistrée comme un succès dans le cache.

Le premier résultat valide est mis en cache avec sa source. Les catégories restent prioritaires sur le nom. Beauty utilise les rayons détaillés de soins, hygiène dentaire et maquillage, avec « Hygiène & beauté » en secours. Pet Food distingue alimentation animale et accessoires/hygiène, avec alimentation animale en secours. Le classement reste dans le domaine du catalogue pour éviter qu’une crème ou du poulet destiné au chat soit classé comme alimentation humaine. Products utilise les correspondances de catégories et les rayons existants. Les articles déjà enregistrés et les choix manuels sont conservés.

## Taxonomies complètes et rayons simples — 0.1.5

Les **28 rayons simples** sont conservés. Le choix manuel est alphabétique en français ; l’ordre des rayons d’une liste reste personnalisable séparément.

Les taxonomies officielles ont été importées intégralement : les relations entre catégories et catégories parentes alimentent un index utilisable hors ligne. Le classement n’exige donc plus que l’API fournisse elle-même tous les parents d’une catégorie détaillée. Les correspondances précises ont priorité sur les mots du nom.

| Catalogue | Catégories importées | Correspondances vers un rayon |
| --- | ---: | ---: |
| Food | 14 718 | 12 743 |
| Products | 5 519 | 5 516 |
| Beauty | 195 | 188 |
| Pet Food | 30 | 26 |

Toutes les entrées sont traitées et conservées, y compris celles sans correspondance. Une catégorie descriptive ou ambiguë, par exemple « produit artisanal », ne suffit pas à imposer un rayon. Le classement utilise alors les autres catégories, le nom et les règles propres au catalogue ; « À classer » reste possible. Il ne garantit pas un classement parfait pour chaque fiche communautaire.

Sources des instantanés : [Food](https://static.openfoodfacts.org/data/taxonomies/categories.json), [Products](https://static.openproductsfacts.org/data/taxonomies/categories.json), [Beauty](https://static.openbeautyfacts.org/data/taxonomies/categories.json), [Pet Food](https://static.openpetfoodfacts.org/data/taxonomies/categories.json). Les URL, empreintes SHA-256, comptes et correspondances sont enregistrés dans `catalogueTaxonomies.json` et son miroir backend. Mise à jour reproductible : `python3 ops/import-product-taxonomies.py` ; `--input-dir` accepte les quatre fichiers sources pour un import hors ligne. Tests de parité mobile/serveur, ascendance, priorités et cycles.

**Diagnostic des quatre codes fournis, le 5 octobre 2026 :** `3254569920478`, `4061458194792`, `5410306883828`, `8700216681667`. Les seize recherches directes ont renvoyé HTTP 404, statut 0, « product not found ». La chaîne ne peut pas inventer un nom absent des catalogues. Renommer une première fois le produit permet désormais de réutiliser ce nom lors des scans suivants sur le même appareil. Quatre produits témoins ont également été retrouvés, un par catalogue, via le client Rust réel.

Les messages d’ajout, de quantité et de résultat du scan disparaissent après 2,5 secondes ; une nouvelle occurrence du même message relance ce délai. L’action volontaire « Ajouter encore ce produit » reste disponible.

## Relecture des listes photographiées — 0.1.5

Le texte reconnu est nettoyé de ses puces, cases et symboles décoratifs ; accents, apostrophes, quantités, pourcentages et formats de conditionnement sont conservés. Le champ devient défilant avec une hauteur limitée. La photo est masquée pendant la saisie et Android utilise le redimensionnement de la fenêtre au-dessus du clavier. Le confort avec le clavier réel doit encore être confirmé sur téléphone.

« Vérifier l’orthographe » propose des corrections à partir d’un petit vocabulaire français local. Chaque proposition doit être acceptée individuellement ; aucun remplacement automatique ni ajout automatique. La correction du clavier système est également activée. Ce correcteur reste limité pour les marques et produits rares ; la saisie libre et la validation finale restent disponibles.

## Rayons détaillés ajoutés en 0.1.4

| Rayon | Exemples |
| --- | --- |
| Soins des cheveux | Shampooing, après-shampooing, masque capillaire |
| Soins du visage & du corps | Crème, gel douche, déodorant, protection solaire |
| Hygiène bucco-dentaire | Dentifrice, brosse à dents, bain de bouche |
| Maquillage & parfums | Mascara, fond de teint, eau de toilette |
| Alimentation animale | Croquettes, pâtée, friandises |
| Accessoires & hygiène des animaux | Litière, gamelle, jouet, shampooing pour chien |
| Maison & cuisine | Casserole, vaisselle, conservation alimentaire |
| Vêtements & linge | Chaussettes, vêtements, linge de lit |
| Électricité & électronique | Piles, ampoules, chargeur, ordinateur |
| Jeux & loisirs | Jouets, livres, jeux de société |

Les anciens rayons génériques sont conservés. Les nouveaux s’ajoutent aux préférences de tri sans déplacer ceux déjà ordonnés. Les articles existants gardent leur catégorie ; l’utilisateur peut choisir un nouveau rayon dans leur édition. Le cache produit est renouvelé pour appliquer les nouvelles correspondances aux prochaines recherches.

Les règles privilégient une expression précise : « shampooing pour chien » avant « shampooing », « ampoule auto » avant « ampoule ». Les catégories anglaises/françaises des catalogues sont mappées avant d’utiliser le nom.

Références consultées le 5 octobre 2026 : [catégories Beauty](https://world.openbeautyfacts.org/categories.json), [catégories Pet Food](https://world.openpetfoodfacts.org/categories.json), [catégories Products](https://world.openproductsfacts.org/categories.json).

## Configuration serveur

| Variable | Valeur par défaut |
| --- | --- |
| `OFF_BASE_URL` | `https://world.openfoodfacts.org/api/v2` |
| `OPF_BASE_URL` | `https://world.openproductsfacts.org/api/v2` |
| `OBF_BASE_URL` | `https://world.openbeautyfacts.org/api/v2` |
| `OPFF_BASE_URL` | `https://world.openpetfoodfacts.org/api/v2` |

`ENABLE_OFF_PROXY` active/désactive l’ensemble des quatre catalogues. Les limites `OFF_RATE_LIMIT_PER_MINUTE` et `OFF_MAX_RETRIES` s’appliquent à chaque catalogue ; la limite de 4 secondes reste prioritaire. Les caches produit utilisent une nouvelle version de clé pour ne pas conserver d’anciens résultats provisoires. Aucun cache de liste ni compte utilisateur n’est supprimé.

## Validation

Tests automatiques : stabilité du scan, chiffre de contrôle, normalisation UPC/EAN, délai, ajout volontaire ; cache local sans réseau ; parcours HTTP des quatre catalogues avec serveurs simulés, arrêt immédiat à chaque niveau, erreurs, résultat vide, code incohérent, timeout et cache après succès. Les tests externes de base de données/Redis/Vault ne sont pas exécutés sans services dédiés.

Contrôle réel du 5 octobre 2026 avec le client Rust de l’application et son budget de quatre secondes : un produit nommé a été récupéré sur chacun des quatre catalogues. Test opt-in : `cargo test --manifest-path backend/Cargo.toml --test product_catalogues live_catalogues_return_named_products -- --ignored --nocapture`.

Références contrôlées : Food `3274080005003`, Products `6111259733749` (produit vaisselle), Beauty `3560070791460` (solution dentaire), Pet Food `5998749117774` (friandises au poulet pour chat et chaton). Ces fiches communautaires peuvent changer.

Le code `3760209549072`, retrouvé dans le journal d’un essai utilisateur, était absent des quatre catalogues lors du contrôle. Le journal montrait aussi un dépassement de délai Beauty lors de l’essai précédent. La fiche Products `3760044183738` existe mais n’a aucun nom renseigné : la recherche passe alors au catalogue suivant. Aucun nom n’est inventé à partir d’une photo ou d’une marque.

L’écran distingue un nom introuvable d’une indisponibilité temporaire ; l’article provisoire reste modifiable dans la liste. Le scan physique reste à retester sur téléphone.

Sources : [documentation officielle des API sœurs](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/), [référence API v2](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/ref-v2/).
