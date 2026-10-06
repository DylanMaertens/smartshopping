# Monétisation et achat sans compte

Proposition du 3 octobre 2026. Ce document prépare les choix produit ; aucun paiement, blocage payant ou système d’activation n’est activé dans l’app.

## Orientation retenue : une même application partout

Dylan souhaite les mêmes fonctionnalités, thèmes et offres sur les différents canaux. Le site proposera l’APK Android et la vente directe ; les boutiques proposeront leur parcours d’achat. F-Droid reste une possibilité à étudier, sans édition fonctionnellement différente prévue pour l’instant.

Conserver une base de code commune, une même version fonctionnelle et un catalogue de droits commun. Seuls les éléments nécessaires à la plateforme et au canal changent : format de distribution, signature, paiement, restauration et mises à jour. Une même offre achetée donne le même contenu ; les tarifs affichés peuvent dépendre des devises, taxes et grilles des boutiques et restent à fixer.

| Distribution | Fichier / publication | Parcours d’achat proposé |
| --- | --- | --- |
| Site SmartShopping, Android | APK de production signé | Achat sur le site, ou bouton dans l’app ouvrant la page de paiement sécurisée ; activation par clé sans compte obligatoire |
| Google Play, Android | Android App Bundle (AAB), dont Play génère les APK adaptés | Achat intégré avec Google Play Billing dans le parcours standard |
| App Store, iOS | Compilation et signature iOS propres à Apple | Achat intégré avec Apple dans le parcours standard |
| F-Droid | À étudier ultérieurement | À retenir seulement si les contraintes sont compatibles avec l’offre souhaitée |

Google Play utilise l’AAB pour publier les nouvelles apps et produit les APK installés sur les appareils : le fichier fourni au store diffère donc déjà de l’APK du site. Cela n’impose pas une différence de fonctionnalités. [Android App Bundles](https://developer.android.com/guide/app-bundle).

### Décision confirmée : téléchargement et fonctions de base gratuits

Décision confirmée par Dylan : **l’app sera gratuite au téléchargement sur tous les canaux, avec les fonctions de base gratuites**. Les offres payantes seront facultatives, avec les mêmes droits pour une même offre quel que soit le canal. Le périmètre détaillé des fonctions de base et des services payants reste à finaliser ; le principe des thèmes fantaisie payants est retenu.

Plus en achat unique et les services en offre annuelle restent la structure proposée ci-dessous. Sur le site, une personne peut acheter une option avant ou après installation, mais le téléchargement de l’APK reste gratuit. Acheter dans l’app distribuée par un store reste un paiement auprès de ce store dans le parcours standard. [Paiements Google Play](https://support.google.com/googleplay/android-developer/answer/9858738?hl=fr), [achats intégrés Apple](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).

Le bouton d’achat choisit le prestataire prévu pour le canal de distribution. Ne pas basculer silencieusement vers le paiement web si la facturation du store échoue. Les éventuels parcours de paiement alternatif ne seront ajoutés qu’avec les conditions régionales applicables. Les droits sont attribués côté serveur après validation du paiement ; avoir les mêmes fonctions partout ne rend pas les achats automatiquement transférables entre stores.

## Modèle proposé

Les fonctions de base locales sont gratuites. Je recommande un achat unique pour les compléments locaux payants, et une offre annuelle facultative pour les services qui génèrent des coûts récurrents. Éviter de promettre un hébergement et un OCR illimités à vie pour un petit achat unique.

| Offre envisagée | Contenu | Paiement |
| --- | --- | --- |
| Découverte | Listes et saisie locales, sans publicité et sans compte | Gratuit |
| Plus | Thèmes fantaisie ; autres fonctions locales avancées à décider avant de restreindre une fonction actuelle | Achat unique |
| Services connectés | Synchronisation, partage et OCR hébergés, avec limites annoncées ; les invités d’une liste peuvent participer sans devoir tous payer | Offre annuelle facultative, portée par le propriétaire payant |

Le partage est une fonction centrale : une autre option serait de regrouper les compléments payants et les services dans une offre annuelle facultative, en conservant le socle gratuit. L’achat unique répond mieux à la demande d’une licence achetable hors store ; les services séparés protègent la pérennité du projet. Aucun tarif n’est fixé ici.

Avant de choisir les prix, mesurer l’hébergement par utilisateur actif, le temps CPU par OCR, la fréquence des synchronisations, les frais de paiement et le support. Calculer la marge nette après taxes et frais, puis vérifier que les revenus annuels des services couvrent leurs coûts. Les fonctions actuelles restent disponibles pendant cette phase de test.

### Thèmes

Le principe des thèmes fantaisie payants est retenu à la demande de Dylan. Répartition proposée : **Papier, Pastel et Pixel dans Plus** ; **Minimal, Nuit et Contraste gratuits**, pour garder les apparences de base et l’accessibilité disponibles. Aucun verrou n’est ajouté pendant les tests. Le cas d’une distribution libre F-Droid est détaillé plus bas.

## Achat Android hors store

Android permet de distribuer un APK depuis un site. Il faut préparer un APK de production signé et un parcours d’installation adapté. Le programme de vérification des développeurs évolue selon les régions : son calendrier et l’enregistrement du paquet devront être revérifiés avant le lancement. [Distribution Android](https://developer.android.com/studio/publish), [vérification développeur](https://developer.android.com/developer-verification).

L’APK et les fonctions de base restent accessibles gratuitement, sans clé. Parcours proposé pour l’achat facultatif d’une offre payante :

1. La personne choisit une offre sur le site SmartShopping et consulte les conditions avant paiement.
2. Elle paie sur une page hébergée par le prestataire, sans créer de compte SmartShopping.
3. Le serveur confirme le paiement et délivre une clé d’activation, un justificatif et un moyen de récupération à conserver.
4. Elle télécharge l’APK signé et saisit la clé dans « Activer mon achat ».
5. Une première connexion valide la clé et associe la licence à l’identité anonyme de l’installation. L’usage local reste ensuite possible hors ligne.

Un paiement peut demander des coordonnées de facturation ou une authentification bancaire : « sans compte SmartShopping » ne signifie pas « sans aucune donnée de paiement ». Prévoir la récupération par clé et code de secours ; proposer l’envoi du justificatif par courriel selon les besoins de facturation et le choix du parcours. Ne jamais demander de mot de passe SmartShopping.

## Moyens de paiement

Première piste : Stripe Checkout hébergé, qui permet un paiement ponctuel ou récurrent. La disponibilité dépend du pays du vendeur, de celui du client, de la devise, du type d’offre et de l’éligibilité du compte. [Checkout](https://stripe.com/payments/checkout), [méthodes disponibles](https://docs.stripe.com/payments/payment-methods/overview).

| Moyen envisagé | Usage proposé |
| --- | --- |
| Carte bancaire | Base du lancement |
| Apple Pay / Google Pay | Si disponibles sur l’appareil et pour la configuration du vendeur |
| Bancontact | Pour les clients concernés, notamment en Belgique |
| PayPal | À activer si le compte vendeur et l’intégration sont éligibles |
| Virement SEPA | À étudier ensuite ; délivrer la clé seulement après confirmation du paiement |

La licence doit être délivrée par un traitement serveur des événements de paiement, jamais sur la seule base de l’écran « paiement réussi ». Les paiements différés nécessitent de distinguer une commande terminée d’un paiement effectivement confirmé. [Événements Checkout](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted), [statut du paiement](https://docs.stripe.com/api/checkout/sessions/object).

## Clé d’activation : architecture proposée

- Clé aléatoire à forte entropie, conservée sous forme d’empreinte côté serveur ; aucun secret de signature dans l’app ou le dépôt.
- Tables séparées pour commandes, licences, activations et événements de paiement. Identifiant d’événement unique pour rendre un rejeu sans effet supplémentaire.
- Vérifier la signature du webhook et la correspondance commande, montant, devise, produit et état payé avant d’émettre une licence. Traiter aussi les événements reçus dans le désordre.
- Réutiliser l’identité anonyme et les requêtes signées déjà présentes. Une clé donne des droits payants, jamais l’accès aux listes d’une autre personne : les invitations restent distinctes.
- Proposition commerciale à confirmer : une licence personnelle pour trois installations actives au total, avec ou sans compte. Prévoir un remplacement d’appareil et une révocation, sans obliger à créer un compte. Pour les achats en boutique, adapter cette politique aux obligations de restauration et d’usage du canal avant de la commercialiser.
- Après activation, fournir une preuve de licence signée par le serveur, liée à l’installation et stockée dans SecureStore. L’app vérifie la signature avec une clé publique embarquée.
- Pour l’achat unique, ne pas imposer une connexion quotidienne aux fonctions locales. Les droits des services hébergés sont contrôlés par le serveur à chaque usage ; leur durée suit l’offre payée.
- Une licence locale hors ligne ne peut pas être révoquée instantanément : appliquer les remboursements et révocations côté serveur puis à la prochaine vérification en ligne. Ne pas promettre une protection contre toute copie.
- Si un droit expire ou est révoqué, préserver les listes et leur consultation. Définir explicitement la possibilité d’exporter ses données avant commercialisation.
- Perdre l’appareil peut faire perdre l’identité et les données locales : récupérer une licence n’est pas restaurer les listes. Prévoir un parcours de sauvegarde/récupération distinct.

### Limiter le partage d’une clé ou d’un compte

L’objectif est de limiter les activations abusives d’une même licence. Une connexion Apple ou Google ne suffit pas : une personne peut connecter plusieurs appareils au même compte.

- Un seul registre serveur des installations par licence, commun aux clés et aux identités facultatives. Ajouter une identité ou restaurer un achat ne crée pas un nouveau quota.
- Activation atomique : vérifier le plafond et réserver la place dans la même transaction, pour que deux demandes simultanées ne dépassent pas la limite. Réactiver la même installation ne consomme pas une deuxième place.
- Chaque installation possède une paire de clés ; la preuve de licence est liée à sa clé publique. Ne pas utiliser l’IMEI, l’adresse IP ou une empreinte intrusive comme identité d’appareil.
- Au plafond, afficher les installations et permettre de retirer un ancien téléphone. Protéger cette gestion par le compte authentifié ou un code de récupération distinct de la clé courante ; limiter les tentatives et les remplacements en rafale, avec recours au support. Une clé divulguée doit pouvoir être remplacée.
- Une réinstallation peut créer une nouvelle identité : expliquer le remplacement plutôt que facturer un nouvel achat. Les accès invités aux listes restent distincts du quota de licence.
- Le serveur peut refuser immédiatement les services à une installation révoquée. Une preuve locale conservée hors ligne continue de fonctionner jusqu’à sa prochaine vérification : un plafond strict partout et à tout instant est incompatible avec un usage local hors ligne sans limite. Les versions modifiées peuvent aussi retirer un verrou local.

Tests à prévoir avant lancement : quatrième activation refusée, deux activations concurrentes, rejeu sans place supplémentaire, remplacement, restauration d’achat sans nouvelle licence, tentative de lier un achat déjà attribué, remboursement et révocation.

### Connexion facultative et restauration des achats

**Connexion, paiement et activation sont trois opérations distinctes.** Apple/Google identifient la personne ; le justificatif de transaction prouve son achat ; notre serveur attribue les droits et enregistre l’installation. Se connecter avec Google ne permet pas, à lui seul, de connaître ses achats Play. [Sign in with Apple](https://developer.apple.com/documentation/signinwithapple), [identité Google](https://developers.google.com/identity/openid-connect/openid-connect).

Parcours proposés :

| Canal | Retrouver ses droits |
| --- | --- |
| Achat direct | Clé et code de récupération, sans compte obligatoire |
| App Store / Google Play | « Restaurer mes achats », avec vérification des transactions du store ; aucun compte SmartShopping obligatoire pour cette restauration |
| Usage Android et iOS | Liaison facultative d’une licence à une identité Apple/Google, ou transfert sécurisé depuis une installation déjà autorisée, selon les règles des canaux concernés |

Une identité fédérée évite un nouveau mot de passe, mais crée bien une association de compte côté SmartShopping : ne pas présenter ce parcours comme totalement sans compte. Conserver une voie indépendante d’Apple et de Google pour les utilisateurs du canal direct et de F-Droid.

Pour les achats intégrés, vérifier les transactions Apple et les jetons d’achat Google, ainsi que les remboursements et expirations. [Droits StoreKit](https://developer.apple.com/documentation/storekit/transaction/currententitlements), [vérification Google Play](https://developer.android.com/google/play/billing/security).

La portabilité Android/iOS serait un choix de notre offre, pas une fonction automatique des stores. Lier les fournisseurs à une licence commune après preuve de possession ; ne jamais fusionner deux identités sur la seule égalité des adresses courriel. Une même transaction ne doit pas pouvoir créer plusieurs licences.

## Versions stores et version directe

La version Android achetée sur le site peut utiliser ce mécanisme de clé. Il faut concevoir des canaux de distribution explicites et tester leur installation, leurs mises à jour et leurs éventuels transferts de données. Ne pas décider à la légère de changer de paquet Android ou de clé de signature après diffusion.

Pour Google Play, les achats de fonctions numériques doivent normalement utiliser sa facturation ; les exceptions et parcours externes dépendent notamment des régions et programmes auxquels le développeur adhère. Ne pas ajouter automatiquement le paiement web ou l’activation directe à cette version. [Politique Google Play](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

### iOS : App Store et boutiques alternatives

Oui, une distribution iOS dans une boutique alternative existante est possible, notamment dans l’Union européenne. Il faut préparer une app signée et notarisée par Apple, configurer sa distribution et obtenir son admission auprès de la boutique. Créer notre propre boutique ou distribuer depuis notre site relève de parcours d’éligibilité distincts.

La réserve sur les clés concernait le parcours App Store standard, dont la règle 3.1.1 encadre les mécanismes de déverrouillage propres. Ce n’est pas une interdiction universelle sur iOS : les options de paiement et d’activation dépendent du canal, de la région et des conditions applicables. Une connexion Apple/Google ne contourne pas ces règles. [Règles App Store](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).

La documentation Apple consultée le 3 octobre 2026 décrit des conditions UE mises à jour au 1er octobre 2026, avec paiements alternatifs et distribution hors App Store. Cette distribution ne supprime pas nécessairement les commissions ni les obligations de déclaration. Choisir une boutique et chiffrer ses conditions ainsi que celles d’Apple avant de fixer le prix ; ne pas promettre une installation hors store accessible dans tous les pays. [Distribution et conditions Apple dans l’UE](https://developer.apple.com/support/apps-in-the-eu/).

### F-Droid et Google Play en parallèle

**Oui : la même application peut être proposée sur les deux.** Android permet plusieurs places de marché ; F-Droid décrit également les applications diffusées ailleurs. Il n’y a pas d’exclusivité imposée par ce choix. [Distribution Android](https://developer.android.com/distribute/marketing-tools/alternative-distribution), [FAQ F-Droid](https://f-droid.org/docs/FAQ_-_App_Developers/).

Même produit et code commun ne signifient pas forcément APK identique. Le dépôt officiel F-Droid exige un logiciel libre, des sources et une construction vérifiables, sans bibliothèques propriétaires incompatibles. Prévoir une variante sans SDK Google propriétaire si nécessaire, et auditer les dépendances actuelles avant de promettre l’admission. Le simple fait que notre dépôt soit public ne suffit pas. [Politique d’inclusion](https://f-droid.org/docs/Inclusion_Policy/).

Préparer les signatures et mises à jour entre canaux : un APK signé par F-Droid peut avoir une signature différente de celui de Google Play. Les constructions reproductibles peuvent permettre de conserver la signature du développeur. Sans compatibilité, un changement de canal peut nécessiter une réinstallation et donc une sauvegarde préalable. [Signatures F-Droid](https://f-droid.org/docs/FAQ_-_App_Developers/#what-about-signing).

**Conséquence pour les thèmes payants :** le code libre permet de modifier et redistribuer l’app conformément à sa licence. Un verrou local peut donc être retiré ; ce modèle ne garantit pas une exclusivité technique des thèmes. Notre contrôle d’accès peut en revanche protéger l’usage de nos propres serveurs, même si le client est modifié. Il ne peut pas empêcher un tiers d’héberger son propre service lorsque la licence du serveur l’autorise.

F-Droid reste en attente : la préférence actuelle est de conserver les mêmes fonctions et offres partout, sans créer d’édition communautaire aux thèmes déverrouillés. L’ancienne piste d’une édition distincte n’est donc pas retenue à ce stade. Il faudra déterminer si une publication conforme est pertinente avec cette orientation et les limites du verrouillage libre. Un service propriétaire ou imposé peut recevoir une mention spécifique dans F-Droid ; payer un hébergement ne rend pas automatiquement son logiciel propriétaire. [Mentions F-Droid](https://f-droid.org/docs/Anti-Features/).

## Étapes avant la vente

1. Décider le périmètre gratuit/payant, les limites des services, le nombre d’appareils et les tarifs après mesure des coûts.
2. Renseigner le pays et l’identité du vendeur, les pays servis, la facturation, le support et les règles de remboursement ; finaliser CGU, CGV et informations de confidentialité adaptées.
3. Construire l’APK autonome, son hébergement HTTPS et son mécanisme de mise à jour.
4. Implémenter en environnement de test le paiement, les webhooks et les licences, puis tester double notification, paiement différé/refusé, remboursement, changement d’appareil et absence de réseau.
5. Brancher les véritables pages CGU/CGV et coordonnées de contact sur les emplacements de l’accueil. Actuellement ces pages indiquent seulement « À venir ».
6. Passer en vente réelle après validation des offres et de la recette, avec suivi des coûts et du support.
