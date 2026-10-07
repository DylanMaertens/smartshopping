# Accueil web — première version locale

Site français statique, responsive, sans dépendance nécessaire au rendu. Accueil, formulaire Contact de démonstration et maquette interactive d’administration, sans backend admin ni authentification. Aucun compte administrateur, envoi d’e-mail, traceur, police distante ou hébergement public. Ce choix conserve la possibilité d’un déploiement sur le VPS prévu, indépendamment d’un hébergeur de sites spécifique.

## Ouvrir l’aperçu

Depuis la racine du dépôt, avec Node.js disponible :

```sh
node web/scripts/prepare-download.mjs
node web/preview.mjs
```

Ouvrir `http://127.0.0.1:8057/`. Le serveur écoute uniquement sur le PC ; Ctrl+C l’arrête. Il ne démarre ni le backend, ni Expo, ni le tunnel HTTPS. Les fichiers HTML/CSS/JS et images sont dans `web/dist/` et peuvent aussi être ouverts localement avec `web/dist/index.html`.

Le téléchargement utilise l’APK 0.1.8 déjà vérifié, non recompilé pour ce site. Le script contrôle son SHA-256 avant copie. Les binaires sous `dist/downloads/` sont exclus de Git ; après un nouveau checkout, restaurer cet artefact puis lancer le script, sinon les liens de téléchargement manqueront. Ne pas publier le dossier avant cette préparation. Le fichier de contrôle SHA-256 contient un nom relatif, sans chemin personnel. Les changements de synchronisation locale réalisés après cet APK ne sont pas inclus ; la page l’indique explicitement.

## Éléments livrés

- Accueil, usages (organisation, scan, partage, OCR), quatre aperçus de thèmes dont Origine, fonctionnement hors ligne, téléchargement 0.1.8 et FAQ native accessible au clavier. Sept thèmes annoncés, conformes à la 0.1.8.
- Captures obtenues depuis les composants réels de l’app via son aperçu web isolé, avec données fictives. Elles ne constituent pas des captures de téléphone Android et ne valident pas le rendu natif. Sources : `mobile/preview/` ; quatre images locales, dont Origine demandé pour le hero. Cette capture montre le code en développement (listes locales sans indicateur de synchro), pas exactement l’APK proposé au téléchargement.
- Page autonome sans requête API. Les boutons de thème changent uniquement l’image présentée ; la FAQ fonctionne aussi sans JavaScript.
- Nom provisoire et version visibles regroupés dans `dist/site-config.js`. Pour changer la marque, modifier aussi le titre, la description et les libellés initiaux HTML afin de préserver le contenu sans JavaScript.
- Aucune promesse de catalogue communautaire ouvert, d’application iOS distribuée ou d’API publique permanente. Contact réel et informations légales restent à réaliser avant publication.

## Contact — formulaire de démonstration

`http://127.0.0.1:8057/contact.html` : adresse fictive, sujet, message limité à 3 000 caractères et prévisualisation avec retour/Échap. Validation des champs, contrôle du texte vide ou trop court, affichage comme texte brut. Aucun envoi, aucune persistance ni transfert vers Messages ; utilisez uniquement des données fictives. CSP `connect-src 'none'` et `form-action 'none'`, formulaire désactivé sans JavaScript. Les valeurs disparaissent au rechargement. Liens depuis l’accueil et vers la FAQ.

## Vérification et renouvellement des captures

Les scripts optionnels nécessitent Playwright et Chromium installés, ainsi que les dépendances existantes du mobile pour reconstruire les captures. `SMARTSHOPPING_PLAYWRIGHT_MODULE` peut désigner le module Playwright du poste ; `PLAYWRIGHT_BROWSERS_PATH` et `SMARTSHOPPING_CHROMIUM` permettent d’utiliser son navigateur de test. Aucun de ces chemins n’est embarqué dans la page.

```sh
node web/scripts/capture-app.mjs
node web/scripts/check-homepage.mjs
node web/scripts/check-admin.mjs
node web/scripts/check-support.mjs
```

Le premier utilise temporairement le port local 8058 puis ferme navigateur et serveur. Il ne lit pas la base ou l’identité de l’app. Le second nécessite l’aperçu 8057 et vérifie les largeurs 320, 390, 768 et 1440, le texte à 200 %, les images, les ancres, les thèmes, la FAQ au clavier et les téléchargements ; il capture les pages dans `.qa/`, non versionné. Ce n’est pas un audit complet d’accessibilité.

Pour renouveler seulement le hero : `node web/scripts/capture-app.mjs origine`.

## Administration — maquette sans connexion

Ouvrir `http://127.0.0.1:8057/admin/index.html#supervision`. Quatre vues dédiées partagent une navigation et les couleurs Origine :

- `#supervision` : activité, états de services et incident **simulés**, raccourcis vers les dossiers et événements.
- `#journaux` : huit exemples techniques, recherche, filtres niveau/service, détails et état sans résultat. Aucune lecture de fichiers de logs.
- `#moderation` : quatre dossiers fictifs, recherche, filtre d’état, propositions concurrentes, consensus indicatif, motif obligatoire et confirmation de décision. Annuler/Échap ne change rien. L’historique et les compteurs reflètent uniquement les simulations de l’onglet ; un rechargement ou Réinitialiser restaure les exemples. Aucune sanction de contributeur.
- `#messages` : trois conversations fictives, recherche, filtres non lus/nouveaux/en cours/traités, marquage lu/non lu explicite, statut modifiable, conversation et brouillon par dossier. Le brouillon survit aux filtres et à la navigation interne, pas au rechargement. Prévisualisation seule, bouton d’envoi désactivé. Réinitialiser demande confirmation si des brouillons existent ; annuler les conserve.

Les données sont dans `dist/admin/demo-data.js` et `message-data.js` (adresses réservées `.invalid`). Aucun `fetch`, stockage persistant, URL de tunnel, compte, mot de passe ou token. La politique CSP interdit les connexions réseau depuis la maquette ; **ce n’est pas une authentification**. Les pages restent librement consultables sur le serveur local : ne jamais y placer de données réelles et ne pas les présenter comme un espace sécurisé. `noindex` n’est pas non plus un contrôle d’accès.

Le contrôle admin vérifie les quatre largeurs, le texte à 200 %, les filtres, les états vides, validation/annulation/confirmation, échappement des notes, remise à zéro et absence d’appels API. Captures dans `.qa/admin-*.png`.

Le contrôle support ajoute validation, prévisualisation, filtres, marquage lu/non lu, états, conservation des brouillons entre dossiers/vues, réinitialisation confirmée/annulée, perte au rechargement, absence de stockage et de transmission, contenu HTML neutralisé et formulaire inactif sans JavaScript. Captures dans `.qa/contact-*.png` et `.qa/admin-messages-*.png`.

Avant raccordement : authentification et autorisations côté serveur, adresse d’API configurable, sessions/révocation, audit durable, règles de modération et invalidation des caches. Les états de disponibilité actuels ne prouvent rien sur le backend réel. Réception, stockage durable, anti-abus et envoi/réception d’e-mails restent à réaliser.

## Déploiement futur

Servir uniquement `web/dist/` avec le frontal HTTPS du VPS, jamais le dépôt complet, `.qa/`, les scripts ou les secrets. Le serveur Node fourni ici sert à la prévisualisation, pas à la production. Vérifier la marque définitive, les informations légales, le contact, l’API publique, les versions des téléchargements et les en-têtes de sécurité avant ouverture. Pas de domaine ou de ressource cloud créé à cette étape.
