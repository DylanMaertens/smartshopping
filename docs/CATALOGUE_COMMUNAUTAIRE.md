# Catalogue communautaire — première tranche locale

État du 6 octobre 2026. Fonctionnalité désactivée par défaut, non publiée, sans nouvel APK. La migration `006_community_catalog.sql` n’a été appliquée que sur les bases jetables des tests. La feuille de route reste dans [FEUILLE_DE_ROUTE.md](FEUILLE_DE_ROUTE.md).

## Parcours livré

La préférence personnelle conservée sur l’appareil reste prioritaire. Ensuite viennent le cache produit (sept jours), Food, Products, Beauty, Pet Food, puis le catalogue communautaire. Le premier résultat externe exploitable arrête la recherche. Seul un **nom ayant atteint le consensus** produit une fiche communautaire finale ; un rayon encore en discussion n’est pas inclus comme rayon validé. Le classement local du mobile peut toujours suggérer un rayon.

Après une absence ou une indisponibilité signalée par le serveur, le mobile consulte les propositions communautaires. Il affiche au maximum trois propositions de champs, signalées comme non validées. Le nom et le rayon sont choisis séparément ; saisie libre, choix manuel et « Plus tard » restent disponibles. La case de participation est décochée et n’apparaît que si le serveur annonce que les contributions sont actives.

L’enregistrement local précède l’envoi facultatif. Une erreur réseau, un quota ou un refus du filtre public ne supprime pas le nom privé. Les réponses tardives ne remplacent pas un renommage ni le contenu d’une autre liste. Il n’existe pas encore de file de renvoi hors ligne des contributions publiques : un échec est signalé, sans réessai automatique.

## Contrat serveur

| Route sous `/api/v1` | Comportement |
| --- | --- |
| `GET /products/:barcode` | Repli communautaire après les sources externes ; 404 pour absence, 503 pour indisponibilité sans fiche utilisable |
| `GET /community/products/:barcode/suggestions` | Trois propositions au maximum et capacité `contributions_enabled` |
| `POST /community/products/:barcode/proposals` | Nom, rayon, ou les deux ; proposition et soutien de son auteur dans une transaction |
| `POST /community/proposals/:id/confirmations` | Accord ou désaccord sur ce champ |
| `POST /community/proposals/:id/reports` | Signalement dédupliqué ; aucune sanction automatique |

Les mutations ne sont enregistrées dans le routeur que si `ENABLE_COMMUNITY_CATALOG=true`, PostgreSQL est configuré et `REQUIRE_DEVICE_SIGNATURES=true`. Elles utilisent l’enrôlement persistant, les signatures HMAC, la fenêtre temporelle et l’anti-rejeu existants. Les réponses `received` accusent réception de la requête, sans promettre une publication ou une validation. Aucun identifiant d’auteur ni dossier de modération n’est renvoyé avec les suggestions.

Chaque appareil peut soutenir une seule valeur par code-barres et par champ. Un changement de choix retire son soutien précédent. Le consensus utilise le nombre d’accords et le nombre d’installations distinctes ayant participé aux propositions actives de ce champ. Les écritures sont sérialisées par installation puis par produit au moyen de verrous transactionnels PostgreSQL ; les attentes de verrou sont bornées. Cent soumissions/confirmations par installation et par jour UTC sont autorisées, avec compteur durable ; les quotas HTTP existants s’appliquent également.

`COMMUNITY_CONSENSUS_MIN_DEVICES=5` et `COMMUNITY_CONSENSUS_RATIO=0.8` sont des **paramètres provisoires configurables**. Cinq accords au moins sont requis avec ces valeurs : quatre accords et un désaccord ne suffisent pas. Un changement de soutien peut retirer le consensus. Une installation ne prouve pas une personne unique ; cette protection ne résout pas à elle seule les créations coordonnées d’appareils.

## Filtre et signalements

Le filtre concerne exclusivement les noms publics : expressions configurables par `COMMUNITY_PROHIBITED_TERMS`, exceptions par `COMMUNITY_PROHIBITED_EXCEPTIONS` (séparées par virgules). Il normalise casse, accents, caractères compatibles Unicode, ponctuation et espaces. Il compare des expressions entières. Une exception ne neutralise pas une autre occurrence interdite dans le même nom. La liste est vide par défaut et doit être définie et revue avant une ouverture réelle ; ce filtre n’est pas une modération sémantique ni un détecteur universel de contournements.

Les motifs sont `wrong_product`, `wrong_name`, `wrong_category`, `abuse`, `spam`. Un signalement répété de la même installation avec le même motif ne crée pas plusieurs dossiers. L’API d’enregistrement est livrée ; le bouton mobile de signalement et l’interface d’examen administratif sont encore à réaliser.

Le schéma conserve auteur/date de l’examen, motif et auteur de restriction, échéance facultative et levée. PostgreSQL refuse une restriction sans signalement **examiné et reconnu fondé contre ce contributeur**. Aucune durée de sanction n’est choisie automatiquement. Les propositions d’un contributeur actuellement restreint sont exclues des lectures et ses votes du décompte. Les nouvelles propositions et confirmations faites pendant la restriction ne sont pas stockées ; elles ne ressortent donc pas à sa levée. La restriction ne modifie ni les listes ni les noms privés.

## Limites avant ouverture publique

- Interface privée de modération, accès administrateur et historique complet et immuable des décisions à ajouter ; aucune route administrative publique n’a été créée.
- Politique de rétention, gestion des faux positifs, contestations et restrictions à préciser.
- Contrôles d’enrôlement et anti-abus à renforcer pour plusieurs installations coordonnées ; dimensionnement et quotas à éprouver.
- Les caches serveur communautaires sont revérifiés contre l’état courant avant réutilisation. Le cache **mobile conserve sept jours**, y compris pour une fiche autrefois validée : une correction/restriction peut donc attendre son expiration sur cet appareil. Un mécanisme d’invalidation anticipée reste à concevoir. Les préférences personnelles n’ont pas de TTL.
- Recette sur téléphone, accès communautaire après reconnaissance d’une fiche déjà validée, interface de signalement et modération opérationnelle à terminer avant exposition publique.

## Vérification reproductible

Avec Cargo et les outils PostgreSQL dans `PATH`, depuis la racine du projet :

```sh
bash ops/test-community-postgres.sh
```

Ce script exécute les tests Rust standard, crée une base jetable sous `/tmp`, applique les migrations et lance les six tests PostgreSQL (un parcours communautaire complet et cinq parcours de synchronisation). La base n’écoute que sur un socket Unix privé et est arrêtée même en cas d’échec. Les données et journaux temporaires sont conservés pour diagnostic. Il ne démarre ni HTTPS, ni Expo, ni le backend de développement.

Le parcours communautaire couvre la migration, les signatures, le repli après les quatre catalogues simulés, l’absence et l’indisponibilité, le consensus distinct du rayon, les répétitions et changements de votes, les écritures simultanées, les restrictions, la déduplication des signalements et le quota après recréation de l’état serveur.

Résultats locaux du 6 octobre : **37 tests Rust standard et 6 tests PostgreSQL réussis**, TypeScript conforme, **248 tests Vitest, 179 tests Jest et 21 contrôles de configuration réussis**. Les tests OCR réel, catalogues externes réels, Redis réel et Vault réel n’ont pas été exécutés lors de cette tranche. La recette native sur téléphone reste à effectuer.
