# Site web, administration et VPS — cadrage du 6 octobre 2026

Statut actuel : interfaces locales réalisées dans la DA Origine ; backend admin, contact réel et déploiement non réalisés. Aucun serveur acheté, domaine réservé, service déployé ou adresse e-mail configurée. Le catalogue public reste désactivé. Budget accepté, nom et domaine reportés.

Mise à jour du 7 octobre : le budget est accepté par l’utilisateur ; le nom et le domaine sont reportés. Une première page d’accueil locale est maintenant réalisée dans `web/dist/`, selon la direction proposée. Voir [le mode d’emploi](../web/README.md). Administration, contact et publication restent à faire. Aucun hébergement n’a été commandé.

Complément du 7 octobre : à la demande de l’utilisateur, les pages dédiées d’administration sont préparées **sans backend**, dans `web/dist/admin/` : supervision, journaux filtrables et modération avec décisions simulées. Bandeau de démonstration permanent, données entièrement fictives, aucun appel API ni authentification. Les compteurs ne mesurent pas le serveur réel ; les décisions sont perdues au rechargement. Adresse du serveur, sécurisation et branchement reportés à une étape ultérieure. Aucun tunnel relancé ni APK généré. Le hero public utilise désormais une capture du thème Origine issue de l’aperçu de l’app sur données fictives.

Contact et Messages, également réalisés le 7 octobre : `web/dist/contact.html` permet uniquement une prévisualisation locale, avec données fictives. La vue admin `#messages` présente trois exemples, recherche/filtres, lecture, états et brouillons par dossier. Aucun transfert entre Contact et Messages, aucune réception ou émission d’e-mail, aucune persistance au rechargement. L’accueil propose l’APK 0.1.8 existant (SHA-256 contrôlé), sept thèmes et quatre aperçus dont Origine. Les contrôles web couvrent mobile/desktop, texte à 200 %, états vides, validation, navigation, brouillons, échappement et absence de transmission. Le chantier serveur décrit ci-dessous reste à réaliser.

## Direction artistique recommandée

Une identité « carnet de courses moderne » : simple, chaleureuse et lisible, adaptée aux courses de tous les jours. Fond blanc cassé `#FAF8F3`, texte anthracite `#202824`, vert profond `#245C46` pour les actions, sauge `#E7EFE8` pour les surfaces secondaires. Accent abricot discret pour illustrer, jamais pour porter seul une information. Palette proposée, contrastes à mesurer lors de la réalisation.

Typographie sans empattement, lisible, hébergée localement ; titres courts, espaces généreux, arrondis modérés, pictogrammes cohérents. Captures réelles de SmartShopping et petites illustrations de listes/paniers plutôt que photos de stock. Le site garde une identité stable ; les six thèmes de l’app sont présentés comme une personnalisation, pas reproduits tous ensemble.

Administration : mêmes couleurs mais interface plus dense, navigation latérale, tableaux filtrables et vues de détail. Clair par défaut, sombre facultatif. Rouge réservé aux problèmes/actions destructrices ; icône et libellé en plus de la couleur. Navigation clavier, focus visibles, textes redimensionnables et animations réduites. Éviter les tableaux de bord remplis de chiffres sans action utile.

## Pages et fonctions

| Espace | Première version | Évolution |
| --- | --- | --- |
| Accueil public | Promesse, captures, bénéfices, fonctionnement hors ligne, scan/OCR, partage, thèmes, accès au téléchargement | Démonstration interactive et témoignages réels lorsque disponibles |
| Téléchargement / aide | APK signé, version, taille, SHA-256, installation sans désinstaller, historique, limites Android et assistance | Liens vers les boutiques une fois publiées |
| Contact | Formulaire, confirmation de réception, protection anti-spam, numéro de dossier | Conversation suivie par e-mail |
| Tableau de bord privé | Incidents actifs, signalements en attente, messages non traités, état des sauvegardes | Tendances et indicateurs métier nécessaires |
| Journaux | Filtres date/service/niveau, code d’erreur, request_id, route normalisée, durée ; lien depuis un incident | Corrélation entre services et export limité aux personnes autorisées |
| Supervision | API, base, Redis, recherche catalogue, OCR, quotas, CPU/RAM/disque, certificats et sauvegardes | Mesures mobiles opt-in si besoin démontré |
| Modération | File de signalements, fiche code-barres, proposition et votes, décision motivée, restriction/levée, historique | Recours et détection des abus coordonnés |
| Messages | Boîte Nouveau / En cours / Répondu / Clos, recherche, notes internes, attribution | Rédaction et envoi depuis l’admin, réponses entrantes dans le même dossier |

Accueil proposé : « Vos courses, simplement. » puis un écran réel de liste et un bouton principal « Télécharger pour Android ». Ensuite trois bénéfices concrets (organiser, scanner, partager), le fonctionnement en trois étapes, la personnalisation, les explications sur les données, une FAQ et le contact. Signaler les fonctions expérimentales ; ne pas annoncer de version iOS distribuée, de promotions ou d’économies garanties inexistantes.

## Architecture proposée

Conserver le backend Rust/Axum et PostgreSQL existants. Proposition : interface web TypeScript/React, avec pages publiques statiques/prérendues et administration interactive séparée. React Router avec Vite permet ce découpage ; le choix exact sera fixé au démarrage du chantier, avec versions et verrouillage des dépendances. Ne pas dupliquer les règles de consensus dans le navigateur. [Options officielles React](https://react.dev/learn/creating-a-react-app), [Vite](https://vite.dev/guide/).

- Domaine public : accueil, aide, téléchargement et contact.
- Sous-domaine API stable pour remplacer le tunnel temporaire sur les versions distribuées.
- Sous-domaine d’administration protégé, session et cookies limités à cet hôte ; aucune clé administrateur dans l’APK.
- Caddy en frontal pour HTTPS, puis services Docker Compose sur réseau privé. Seuls HTTP/HTTPS publics ; SSH limité. PostgreSQL, Redis, métriques, journaux et Grafana ne sont pas exposés directement. [HTTPS Caddy](https://caddyserver.com/docs/quick-starts/https).
- Petite bêta : une machine pour API/OCR, base et interfaces ; sauvegardes et contrôle de disponibilité à l’extérieur. C’est un point de panne unique, pas de la haute disponibilité.
- Réutiliser Prometheus/Grafana du dépôt. Ajouter la collecte centralisée des logs progressivement avec rétention bornée, pas une pile coûteuse d’emblée.

Attention : `observability/docker-compose.yml` est une base technique, pas un déploiement Internet prêt. Il publie actuellement les ports backend/Prometheus/Grafana ; il faut en restreindre l’exposition, ajouter le frontal, la persistance adaptée, les limites de ressources et l’authentification. L’image OCR doit être construite et testée sur la cible ; ne pas extrapoler la réussite des tests locaux à la production.

## Authentification, journaux et modération

Comptes administrateurs nominatifs, MFA, aucune inscription administrateur publique. Rôles séparés administrateur/modérateur/support/lecture seule, vérifiés côté serveur. Sessions expirables et révocables, protection CSRF pour les mutations, limites de connexion et traçabilité. Masquer les boutons ne constitue pas une autorisation. Un accès réseau privé peut compléter ces protections.

Séparer journaux techniques et historique d’audit des actions administratives. Ne pas enregistrer mots de passe, secrets d’appareil, jetons d’invitation, corps des listes, photos OCR ou corps de messages dans les logs. Les noms de routes doivent être normalisés : pas de code-barres comme étiquette de métrique. Définir une rétention justifiée et les accès avant activation. [Recommandations de journalisation CNIL](https://www.cnil.fr/fr/securite-tracer-les-operations).

La supervision du serveur ne prouve pas que l’app fonctionne sur tous les téléphones : plantages, écran bloqué et usage hors ligne restent invisibles sans instrumentation mobile distincte. Ne pas présenter le nombre d’installations comme un nombre de personnes. Les signaux de santé publics éventuels sont agrégés, sans logs ni dossiers utilisateurs.

Pour chaque signalement : état reçu/en examen/fondé/non fondé, motif de décision, opérateur et date. Ne pas sanctionner sur le nombre brut de signalements. Afficher les versions concurrentes du nom/rayon, ne pas confondre consensus et véracité. Historique append-only des décisions, contrôle des accès et copie d’audit externe à prévoir ; une table modifiable par l’administrateur de la base n’est pas « inviolable ». Les corrections/retraits doivent aussi traiter l’invalidation du cache mobile, encore manquante. Les choix privés restent privés.

## Contact et réponses intégrées

Étape 1 : formulaire limité (adresse de réponse, objet, message), validation, anti-spam et limites de taille/fréquence ; stockage du dossier et notification à la boîte support. Pas de pièces jointes au lancement. Éviter les réponses automatiques à un tiers avant contrôle anti-abus. Information claire sur l’utilisation et la conservation des données.

Étape 2 : composer une réponse dans l’admin, prévisualiser puis confirmer explicitement l’envoi. Utiliser un fournisseur d’e-mails transactionnels ou une messagerie professionnelle : ne pas héberger soi-même SMTP sur le VPS. Prévoir SPF/DKIM/DMARC, file d’envoi persistante, déduplication, statuts de livraison et erreurs. Pour recevoir les réponses dans le même dossier, ajouter un traitement entrant vérifié (webhook signé ou boîte dédiée), un identifiant de conversation et une vérification de l’expéditeur ; un simple bouton d’envoi ne suffit pas. Les notes internes ne partent jamais au destinataire.

## VPS : dimensionnement et choix

Hypothèse : petite bêta francophone, API Rust, PostgreSQL, Redis, OCR local et supervision légère. Point de départ conseillé : **4 vCPU, 8 Go RAM, 75–80 Go SSD/NVMe, x86-64, région européenne**. Ce n’est pas une garantie de capacité : mesurer les pics mémoire/CPU OCR et les temps de réponse. Limiter la concurrence OCR ; séparer ce traitement si les synchronisations ralentissent. Compiler sur le poste/CI, pas en concurrence avec l’API sur la petite machine de production.

Comparaison consultée le 6 octobre 2026, à revérifier dans le panier (région, disponibilité, engagement, renouvellement, TVA et options) :

| Fournisseur | Repère tarifaire officiel consulté | Avis pour ce projet |
| --- | --- | --- |
| OVHcloud VPS-2 | 4 vCores, 8 Go, 75 Go ; à partir de **7,21 € HT / 8,65 € TTC par mois** | Premier choix si région France disponible et tarif confirmé ; IPv4 et sauvegarde quotidienne annoncées incluses |
| Hetzner CX33 | Tarif Allemagne/Finlande publié : **8,49 € HT/mois hors IPv4** | Alternative européenne à comparer avec IPv4, sauvegardes et stockage externe inclus dans le total |

Sources : [offres OVHcloud](https://www.ovhcloud.com/fr/vps/), [tarifs Hetzner applicables depuis juin 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/). Le relevé OVH indique une restauration quotidienne sur les cartes et des durées différentes dans les options : confirmer précisément la rétention au panier. Dans tous les cas, une sauvegarde fournisseur ne remplace pas un export PostgreSQL cohérent, chiffré, hors machine et restauré lors d’un essai.

**Enveloppe de travail estimée : 15–25 €/mois**, VPS + réserve sauvegardes/e-mail/domaine amorti, à affiner selon les offres choisies. Ce n’est pas un devis ; taxes/options peuvent modifier le total. Pas besoin de Kubernetes, de GPU ni de serveur dédié à ce stade. Un VPS reste à administrer : mises à jour, alertes, restauration et incidents ne sont pas pris en charge par le simple abonnement.

## Tester sans deuxième téléphone

Les tests PostgreSQL du dépôt simulent déjà plusieurs installations distinctes, le partage, les invitations et le consensus communautaire. Les tests de composants couvrent les écrans, mais ce ne sont pas des essais natifs complets.

Préparer ensuite deux appareils Android virtuels avec stockage et identités distincts, ou un téléphone et un émulateur. Tester invitation, modification simultanée, hors ligne/reconnexion, révocation et suppression ; avec plusieurs installations simulées, tester signalement et seuil de consensus sans le baisser en production. La possibilité de plusieurs instances est documentée par [Android](https://developer.android.com/studio/run/advanced-emulator-usage). Les outils émulateur/images système ne sont pas installés dans le SDK local inspecté ; téléchargement et configuration restent à faire. L’APK actuel ne contient que les architectures ARM : sur un émulateur x86-64, produire un build de test adapté, distinct de l’APK livré.

Préserver à terme un essai réel pour caméra, permissions, clavier, mises en veille et installation d’une mise à jour sans perte de données. Aucun test physique n’est déclaré réalisé à partir des seuls tests automatiques.

## Ordre de réalisation et décisions attendues

1. Valider la direction artistique, le domaine/nom public et le budget mensuel maximal.
2. Réaliser la maquette de l’accueil et de l’admin, sans vraies données ni fausse promesse de fonctionnalités disponibles.
3. Construire l’authentification admin, l’audit, la modération et l’invalidation des fiches ; contact puis traitement des messages.
4. Préparer le déploiement reproductible, secrets, pare-feu, sauvegarde externe, restauration, alertes externes et retour à la version précédente.
5. Installer une préproduction avec données synthétiques et tester les échanges multi-installations. Ouvrir le catalogue uniquement après validation de la modération et des protections.
6. Publier le site et un APK pointant vers l’API stable après accord explicite et recette.

Autres points à régler : disponibilité du nom/marque et du domaine ; mentions légales/confidentialité et conditions adaptées au statut réel du projet ; procédure de suppression des données et de récupération des accès ; sauvegarde privée de la clé APK ; politique de restrictions/recours ; capacité et coûts sous charge ; gestion des versions d’API et mises à jour Android ; personne qui reçoit et traite les alertes. La rédaction juridique finale doit être adaptée au service réellement lancé, pas copiée d’un modèle présenté comme conforme.
