# Accueil web — première version locale

Site français statique, responsive, sans dépendance nécessaire au rendu. Accueil, formulaire Contact de démonstration et maquette interactive d’administration. Aucun envoi d’e-mail, traceur, police distante ou hébergement public. La maquette n’authentifie personne : l’administration réelle est servie séparément par le backend Rust en HTTPS à `/admin/`, avec un compte local, Supervision, Journaux, Modération et Messages. Le vrai formulaire de test est servi à `/contact.html` sur ce même backend, uniquement après activation explicite. Voir [activation et limites](../docs/ADMINISTRATION.md). Ce choix conserve la possibilité d’un déploiement sur le VPS prévu, indépendamment d’un hébergeur de sites spécifique.

## Ouvrir l’aperçu

Depuis la racine du dépôt, avec Node.js disponible :

```sh
node web/scripts/prepare-download.mjs
node web/preview.mjs
```

Ouvrir `http://127.0.0.1:8057/`. Le serveur écoute uniquement sur le PC ; Ctrl+C l’arrête. Il ne démarre ni le backend, ni Expo, ni le tunnel HTTPS. Les fichiers HTML/CSS/JS et images sont dans `web/dist/` et peuvent aussi être ouverts localement avec `web/dist/index.html`.

Le téléchargement utilise l’APK existant **Poduna 0.1.11**, code Android 12, vérifié le 10 octobre : SHA-256 `ba9f1406f2df3ba2dfa08ed7f30b12147a80774ffe7f064b21407b7165955654`, signature identique aux versions précédentes. Aucun nouvel APK compilé pour cette étape. Le script contrôle son SHA-256 avant copie. Les binaires sous `dist/downloads/` sont exclus de Git ; après un nouveau checkout, restaurer cet artefact puis lancer le script, sinon les liens manqueront. Le fichier SHA-256 contient un nom relatif, sans chemin personnel. Cet APK inclut les rayons mémorisés/regroupés, la normalisation prudente des pluriels et le correcteur OCR de la 0.1.10 ; les modifications mobiles ultérieures ne sont pas annoncées comme incluses.

## Éléments livrés

- Accueil, usages (organisation, scan, partage, OCR), quatre aperçus de thèmes dont Origine, fonctionnement hors ligne, téléchargement 0.1.11 et FAQ native accessible au clavier. Sept thèmes conservés.
- Captures obtenues depuis les composants réels de l’app via son aperçu web isolé, avec données fictives. Elles ne constituent pas des captures de téléphone Android et ne valident pas le rendu natif. Sources : `mobile/preview/` ; quatre images locales, dont Origine demandé pour le hero. Code aligné sur la 0.1.9 ; le rendu navigateur reste distinct du rendu natif.
- Page autonome sans requête API. Les boutons de thème changent uniquement l’image présentée ; la FAQ fonctionne aussi sans JavaScript.
- Nom Poduna et version visibles regroupés dans `dist/site-config.js`. Les titres, descriptions et libellés HTML sont aussi à jour sans JavaScript. Logo vectoriel, favicon multi-tailles et icône Apple locaux dans `dist/assets/brand/`, issus du kit validé. `node ops/sync-brand-assets.mjs` les régénère depuis la racine du dépôt.
- Guide `aide-android.html` : installation, mise à jour sans désinstallation, sauvegarde, serveur temporaire et dépannage. Page `404.html` avec liens absolus vers l’accueil, le guide et le contact. Le serveur d’aperçu retourne bien HTTP 404 (y compris HEAD) ; configurer le futur frontal pour servir cette page sans retourner 200. Le port de l’aperçu est configurable via `PORT`, défaut 8057.
- Aucune promesse de catalogue communautaire ouvert, d’application iOS distribuée ou d’API publique permanente. Informations légales, conservation des données et déploiement restent à préparer avant publication.

## Contact — formulaire de démonstration

`http://127.0.0.1:8057/contact.html` : adresse fictive, sujet, message limité à 3 000 caractères et prévisualisation avec retour/Échap. Validation des champs, contrôle du texte vide ou trop court, affichage comme texte brut. Aucun envoi, aucune persistance ni transfert vers Messages ; utilisez uniquement des données fictives. CSP `connect-src 'none'` et `form-action 'none'`, formulaire désactivé sans JavaScript. Les valeurs disparaissent au rechargement. Liens depuis l’accueil et vers la FAQ.

Six questions fréquentes sont directement consultables à côté du formulaire sur ordinateur, puis sous celui-ci sur mobile. L’introduction est placée au-dessus des deux cartes : bords supérieurs, titres, marges intérieures et hauteur de ligne de grille sont alignés, sans hauteur fixe. Accordéons HTML natifs utilisables sans JavaScript : mise à jour, hors ligne, produit inconnu, adresse du serveur, absence de compte et limites du formulaire. L’admin garde sa navigation existante ; le blocage signalé a été résolu côté utilisateur, sans modification supplémentaire de son fonctionnement.

## Vérification et renouvellement des captures

Les scripts optionnels nécessitent Playwright et Chromium installés, ainsi que les dépendances existantes du mobile pour reconstruire les captures. `SMARTSHOPPING_PLAYWRIGHT_MODULE` peut désigner le module Playwright du poste ; `PLAYWRIGHT_BROWSERS_PATH` et `SMARTSHOPPING_CHROMIUM` permettent d’utiliser son navigateur de test. Aucun de ces chemins n’est embarqué dans la page.

```sh
node web/scripts/capture-app.mjs
node web/scripts/check-homepage.mjs
node web/scripts/check-admin.mjs
node web/scripts/check-support.mjs
node web/scripts/check-help.mjs
```

Le premier utilise temporairement le port local 8058 puis ferme navigateur et serveur. Il ne lit pas la base ou l’identité de l’app. Le second nécessite l’aperçu 8057 et vérifie les largeurs 320, 390, 768 et 1440, le texte à 200 %, les images, les ancres, les thèmes, la FAQ au clavier et les téléchargements ; il capture les pages dans `.qa/`, non versionné. Ce n’est pas un audit complet d’accessibilité.

Pour renouveler seulement le hero : `node web/scripts/capture-app.mjs origine`.

`PODUNA_WEB_URL` permet de tester un aperçu sur un autre port. Validation du 10 octobre : accueil/téléchargement, guide/404, contact et admin sur quatre largeurs, texte à 200 %. Le contact réel reprend maintenant les styles et le logo du site, la FAQ alignée et le guide Android. Ses fichiers publics sont copiés depuis `web/dist` vers `backend/public` par `node web/scripts/sync-backend-site.mjs` ; `--check` contrôle leur synchronisation. Ces copies générées doivent être versionnées pour le contexte Docker backend : ne pas les éditer directement. Relancer le script après modification des styles partagés, du logo ou du guide, puis recompiler le backend. Les routes publiques servent uniquement ces fichiers explicitement embarqués, jamais un répertoire arbitraire. Le backend de contact ne sert pas un second téléchargement APK et les liens du guide y reviennent au contact.

## Administration — maquette sans connexion

Ouvrir `http://127.0.0.1:8057/admin/index.html#supervision`. Quatre vues dédiées partagent une navigation et les couleurs Origine :

- `#supervision` : activité, états de services et incident **simulés**, raccourcis vers les dossiers et événements.
- `#journaux` : huit exemples techniques, recherche, filtres niveau/service, détails et état sans résultat. Aucune lecture de fichiers de logs.
- `#moderation` : quatre dossiers fictifs, recherche, filtre d’état, propositions concurrentes, consensus indicatif, motif obligatoire et confirmation de décision. Annuler/Échap ne change rien. L’historique et les compteurs reflètent uniquement les simulations de l’onglet ; un rechargement ou Réinitialiser restaure les exemples. Aucune sanction de contributeur.
- `#messages` : trois conversations fictives, recherche, filtres non lus/nouveaux/en cours/traités, marquage lu/non lu explicite, statut modifiable, conversation et brouillon par dossier. Le brouillon survit aux filtres et à la navigation interne, pas au rechargement. Prévisualisation seule, bouton d’envoi désactivé. Réinitialiser demande confirmation si des brouillons existent ; annuler les conserve.

Les données sont dans `dist/admin/demo-data.js` et `message-data.js` (adresses réservées `.invalid`). Aucun `fetch`, stockage persistant, URL de tunnel, compte, mot de passe ou token. La politique CSP interdit les connexions réseau depuis la maquette ; **ce n’est pas une authentification**. Les pages restent librement consultables sur le serveur local : ne jamais y placer de données réelles et ne pas les présenter comme un espace sécurisé. `noindex` n’est pas non plus un contrôle d’accès.

Le contrôle admin vérifie les quatre largeurs, le texte à 200 %, les filtres, les états vides, validation/annulation/confirmation, échappement des notes, remise à zéro et absence d’appels API. Captures dans `.qa/admin-*.png`.

Le contrôle support ajoute validation, prévisualisation, filtres, marquage lu/non lu, états, conservation des brouillons entre dossiers/vues, réinitialisation confirmée/annulée, perte au rechargement, absence de stockage et de transmission, contenu HTML neutralisé et formulaire inactif sans JavaScript. Captures dans `.qa/contact-*.png` et `.qa/admin-messages-*.png`.

Le raccordement réel est désormais disponible **sur le backend**, sans transformer la maquette en espace privé : sessions/révocation/CSRF, audit transactionnel, décisions de modération, invalidation des caches serveur, réception durable et quotas de contact. Le contact statique propose un champ HTTPS qui prépare un lien explicite vers le formulaire réel, sans transférer ses champs ni conserver l’adresse. La maquette garde ses données fictives et ne mesure pas le serveur. Envoi/réception d’e-mails, conservation des messages, protection renforcée et déploiement restent à réaliser avant ouverture publique.

## Déploiement futur

Servir uniquement `web/dist/` avec le frontal HTTPS du VPS, jamais le dépôt complet, `.qa/`, les scripts ou les secrets. Le serveur Node fourni ici sert à la prévisualisation, pas à la production. Vérifier la marque définitive, les informations légales, le contact, l’API publique, les versions des téléchargements et les en-têtes de sécurité avant ouverture. Pas de domaine ou de ressource cloud créé à cette étape.
