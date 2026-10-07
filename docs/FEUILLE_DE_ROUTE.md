# Feuille de route SmartShopping

## État et décisions

Ce document présente les prochaines étapes et les évolutions convenues. Les fonctionnalités futures décrites ici ne sont pas encore implémentées. Le suivi des réalisations reste dans [COMPTE_RENDU.html](../COMPTE_RENDU.html).

- **Cache produit : durée actuelle de 7 jours conservée.** La proposition de passage à 30 jours est abandonnée. Les listes et les noms personnels mémorisés restent distincts du cache.
- **Promotions : accessibles directement depuis l’application**, avec choix entre ville/code postal et géolocalisation facultative. Rayon configurable jusqu’à 50 km maximum.
- Le serveur local a été arrêté à la demande de l’utilisateur.
- **APK de test 0.1.8 livré le 7 octobre 2026** : Origine et les deux nouveaux rayons inclus, code Android 9, même certificat que la 0.1.7. TypeScript et 514 tests mobiles/configuration réussis, compilation et contenu de l’APK vérifiés. Installer par-dessus sans désinstaller ; recette physique encore à faire. Le site local propose désormais la 0.1.8 après vérification SHA-256, sans nouvelle compilation. [Installation et contrôles](APK_TEST_LOCAL.md).

## Prochaines étapes, dans l’ordre

1. **Valider l’APK Android actuel sur téléphone** : Alcools, produit inconnu à nommer, reprise du scanner, notifications à 2,5 secondes et confort du clavier OCR.
2. **Terminer les essais à deux appareils** : ajout simultané du même article, modifications hors ligne, reconnexion, suppression pendant une modification et retrait d’un membre. Corriger les problèmes reproduits.
3. **Compléter la sauvegarde personnelle** : noms/rayons mémorisés par code-barres et préférences d’apparence, en conservant la compatibilité avec les sauvegardes existantes.
4. **Dernière passe UI/UX et accessibilité** : petits écrans, clavier, textes agrandis, contrastes et messages d’erreur.
5. **Serveur permanent** : domaine, HTTPS fixe, données persistantes, sauvegardes restaurables et suivi des incidents/coûts.
6. **Bêta limitée** : essais réels, suivi des ressources et priorisation des retours.
7. **Offres et licences** : préciser les tarifs et limites, puis implémenter et tester achats, clés, restauration et révocation. Fonctions de base gratuites ; thèmes fantaisie prévus dans l’offre payante.
8. **Distribution publique Android** : site, téléchargement, mises à jour, contact, CGU/CGV et confidentialité.
9. **iOS** : compilation signée et essais sur iPhone avant diffusion.

Le catalogue communautaire et les promotions ci-dessous constituent des chantiers distincts. Leur place dans le calendrier de diffusion reste à préciser ; ils ne sont pas présentés comme des prérequis déjà réalisés.

## Catalogue communautaire — périmètre retenu

### Recherche et participation

Ordre prévu :

**Préférence personnelle/cache local → API externes → API communautaire → choix ou saisie du nom et du rayon.**

- Conserver l’ordre des sources externes : Food, Products, Beauty, Pet Food.
- Réutiliser directement une fiche communautaire validée sans redemander systématiquement son nom.
- Pour les propositions en cours, afficher **trois choix maximum**, plus une possibilité de saisir autre chose ou de passer.
- Participation **facultative** : enregistrer un nom personnel ne le publie pas automatiquement.
- Validation **séparée du nom et du rayon**. Une erreur de catégorie ne rend pas nécessairement le nom incorrect.
- Une fiche validée reste corrigeable ou révocable : « validée » ne signifie pas définitivement figée.
- Préserver la mémorisation locale immédiate et l’usage hors ligne. Distinguer l’absence d’un produit de l’indisponibilité d’une source.
- Limiter les confirmations répétées d’une même installation sur un même produit.

### Liste de mots et expressions interdits

- Filtre destiné aux **contributions publiques uniquement**, sans incidence sur les noms strictement locaux.
- Liste configurable de mots et expressions, avec normalisation des espaces, de la casse et des variantes courantes.
- Comparer des mots/expressions entiers plutôt que de simples fragments pour éviter de bloquer des noms légitimes.
- Prévoir exceptions et traitement des faux positifs.
- Un refus par le filtre ne suffit pas à lui seul à sanctionner un contributeur.

### Signalements et restrictions

- Motifs distincts : mauvais produit, nom incorrect, rayon incorrect, insultes, publicité/spam.
- Les décisions reposent sur des **signalements examinés et reconnus fondés**, pas sur leur nombre brut.
- Une restriction discrète peut empêcher la diffusion des propositions d’un contributeur sanctionné. Son utilisation personnelle de l’application et ses noms locaux restent inchangés.
- Ne pas annoncer comme validée publiquement une proposition ignorée ; distinguer enregistrement personnel et validation communautaire.
- Conserver un historique des décisions, permettre la levée d’une restriction et la correction des fiches affectées.
- Une installation anonyme ne garantit pas une personne distincte : prévoir quotas et contrôles des contributions coordonnées.

### Paramètres à confirmer

- Seuil de consensus : proposition initiale de **5 confirmations distinctes et 80 % d’accord**, à ajuster après essais.
- Durée des restrictions : proposition initiale de **30 jours**, puis prolongation ou permanence après examen des récidives. Cette durée n’est pas définitivement arrêtée.
- Gestion des désaccords persistants, faux positifs et invalidation des fiches mises en cache après correction ou retrait.

## Site web et espace privé de modération

**7 octobre 2026 :** première page d’accueil locale réalisée (`web/dist/`) : présentation, captures de l’interface sur données fictives, thèmes sélectionnables, téléchargement APK 0.1.7 et FAQ. Budget accepté ; nom/domaine reportés. Pas d’espace admin, contact ou déploiement à cette étape. [Aperçu et préparation des téléchargements](../web/README.md).

**Complément du 7 octobre :** maquette locale interactive des pages Supervision, Journaux et Modération dans `web/dist/admin/`, avec recherche, filtres, dossiers, motif et confirmation des décisions simulées. Aucun backend admin, accès sécurisé, log réel ou sanction réelle ; pas de persistance des simulations. Contrôles navigateur à 320, 390, 768 et 1440 pixels, texte à 200 %, navigation et scénarios de décision. Le hero de l’accueil montre le thème Origine, sur données fictives et code en développement. Connexion au serveur, protection de l’accès et APK reportés conformément à la demande.

**Contact et Messages — complément du 7 octobre :** formulaire Contact de démonstration (validation et prévisualisation, sans transmission) et quatrième vue admin Messages (recherche, filtres, lecture, états, conversation et brouillons par dossier). Données fictives et mémoire d’onglet uniquement ; aucun e-mail ni backend. Accueil aligné sur l’APK 0.1.8 déjà livré et les sept thèmes ; aperçu Origine sélectionnable. Vérifications sur quatre largeurs et texte à 200 %, parcours, échappement, absence de transmission/persistance et absence de JavaScript. Les optimisations de synchronisation locale restent hors de cet APK, limite mentionnée sur le site.

Le cadrage détaillé (direction artistique, accueil, administration, supervision, modération, messages et sélection du VPS) est préparé dans [SITE_WEB_ET_VPS.md](SITE_WEB_ET_VPS.md). Les interfaces locales sont réalisées ; le backend admin, le contact réel et le déploiement restent à faire. Budget accepté, nom/domaine reportés, aucun serveur commandé.

- **Site public** : présentation de l’app, téléchargement APK, historique des versions, aide, contact, CGU/CGV et confidentialité.
- **Espace privé** : recherche par code-barres, propositions de noms/rayons, confirmations, signalements et restrictions.
- Prévoir contrôle d’accès, historique des actions, correction/retrait de fiches et levée de sanctions.
- Dossiers de modération non publics.
- Suivi opérationnel : disponibilité, erreurs, coûts et quotas ; gestion des achats/licences lorsqu’ils existent.
- Une modération minimale doit être disponible **dès l’ouverture des contributions publiques**, même si le site vitrine complet est réalisé plus tard.

## Thème Origine — réalisé le 7 octobre 2026

Septième ambiance de l’app, accordée à l’accueil web : ivoire, cartes blanches, sauge et vert profond, titres avec empattements. Disponible dans Réglages → Apparence ; utilisé par défaut en l’absence de préférence valide, sans réécrire les choix déjà enregistrés (y compris Minimal). Une lecture du stockage défaillante ne bloque pas le démarrage.

TypeScript conforme ; 285 tests Vitest, 208 tests Jest et 21 tests de configuration réussis. Contrastes calculés à au moins 4,5:1 pour les textes sur les surfaces et le texte du bouton principal ; contrôle visuel via React Native Web à 320 et 390 pixels sur données fictives, sélection et persistance vérifiées. Essai natif Android restant à faire. **Inclus dans l’APK 0.1.8**, compilé ensuite à la demande de l’utilisateur ; le site propose désormais cette version et les sept thèmes.

## Listes locales sans synchronisation superflue — 7 octobre 2026

Implémenté après l’APK 0.1.8, **pas encore recompilé pour Android** : listes nouvelles, jamais synchronisées ou restaurées indépendantes locales par défaut. Aucun appel de synchronisation au démarrage, après modification, à la reconnexion ou au retour dans l’app ; pas de minuterie d’actualisation pour une liste locale ouverte. Le statut sous le titre et l’accès Synchronisation dans Réglages sont masqués pour ces listes, ainsi qu’en l’absence de serveur de test configuré.

Ouvrir Partager ne suffit pas : demander explicitement un code d’invitation active et mémorise la synchronisation avant le premier envoi. Rejoindre une liste l’active également. En cas d’échec réseau après activation, cette intention reste enregistrée pour permettre la reprise ; les articles restent sur l’appareil. Scan, recherche produit et OCR sont indépendants de cette politique.

Compatibilité : les listes des versions précédentes ayant déjà été synchronisées restent activées, même si elles étaient personnelles ; une ancienne participation détectable est conservée. L’app ne peut pas reconstituer avec certitude l’usage partagé des anciennes listes. Les accès révoqués restent bloqués et leur explication reste visible lorsqu’un serveur est configuré. Aucune donnée locale ou distante supprimée.

Vérifications : TypeScript, 293 tests Vitest, 212 tests Jest et 21 contrôles de configuration réussis. Tests SQLite de conservation de l’activation et de migration, absence de requêtes pour les listes locales, activation sur invitation/rejoindre, scan indépendant. Aperçu sur données fictives à 320 et 390 pixels : indicateur et commande masqués en local, indicateur rétabli après activation du partage. Recette native encore à effectuer ; backend, Expo et tunnel non redémarrés.

## Promotions locales — fonctionnalité future dans l’app

### Parcours utilisateur

- Proposer un écran de promotions **directement dans SmartShopping**, sans obliger à passer par un site.
- L’utilisateur choisit sa ville via un code postal, avec sélection de la commune si plusieurs correspondent, ou la géolocalisation facultative sur autorisation.
- La consultation reste possible sans autoriser la géolocalisation, grâce au code postal.
- Rayon réglable, **50 km maximum**. Indiquer si le point de référence est la ville choisie ou la position de l’appareil.
- Présenter les magasins, dates de validité et conditions des offres : carte de fidélité, quantités et restrictions éventuelles.
- Retirer les offres expirées ; ne pas confondre promotion et disponibilité en stock.
- Prévoir absence d’offres, position indisponible et modification de la zone de recherche.

### Points à résoudre avant développement

- Identifier une source fiable des promotions, ses conditions d’accès, les magasins couverts et sa fréquence d’actualisation.
- Déterminer la précision géographique nécessaire ; éviter un suivi permanent de la position.
- Évolution possible à discuter : rapprocher les promotions des articles de la liste, sans partager automatiquement listes ou position avec un partenaire.
- Garder ce module indépendant du catalogue communautaire et de la première diffusion de l’application.

## Documents associés

- [Monétisation](MONETISATION.md)
- [Distribution](DISTRIBUTION.md)
- [APK de test](APK_TEST_LOCAL.md)
- [Recherche de produits](RECHERCHE_PRODUITS.md)
- [Sauvegarde](SAUVEGARDE.md)
- [Site web, administration et VPS](SITE_WEB_ET_VPS.md)

## Rayons du quotidien — complément du 6 octobre 2026

Deux rayons ajoutés au code : **Compléments alimentaires** et **Premiers soins**, soit 31 entrées avec « À classer ». Les protections périodiques restent dans Hygiène & beauté, avec reconnaissance améliorée. Pas de multiplication des sous-rayons : beauté, animaux, maison, cuisine, linge et bricolage sont déjà couverts.

Taxonomies des quatre catalogues régénérées ; noms enrichis en nutriments distingués des compléments, tags vétérinaires distingués des produits humains. Cache de recherche versionné à nouveau, durée de sept jours inchangée, sans réécriture des listes ni des préférences privées. Ces changements ne sont **pas présents dans l’APK 0.1.7 déjà livré** ; aucun nouvel APK n’a été généré lors de ce complément.

## Première tranche communautaire — implémentation locale du 6 octobre 2026

La première tranche implémente le stockage durable, la lecture après les catalogues externes, les propositions limitées à trois, la participation mobile facultative, le consensus configurable et l’enregistrement des signalements. Le complément mobile permet désormais de signaler les propositions en cours et les champs déjà validés avec un motif explicite, sans modifier les choix privés. Les fiches actuelles sont consultables depuis l’édition d’un article avec code-barres ; les lignes regroupées exigent le choix du code concerné. Elle ne constitue pas une ouverture publique : l’activation reste explicite, PostgreSQL et les signatures d’appareil sont requis pour les mutations. L’interface administrative de modération et l’invalidation anticipée du cache mobile restent à réaliser avant exposition publique. Contrat, protections, limites et recette : [CATALOGUE_COMMUNAUTAIRE.md](CATALOGUE_COMMUNAUTAIRE.md). Le serveur local reste arrêté ; l’état de l’APK est suivi dans [APK_TEST_LOCAL.md](APK_TEST_LOCAL.md).
