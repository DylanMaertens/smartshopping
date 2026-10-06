# Préparer une application installable

État au 4 octobre 2026 : un premier APK Android autonome et signé a été compilé localement, sans compte Expo. Sa signature, son intégrité et son contenu ont été vérifiés ; l’installation sur téléphone reste à confirmer. Le serveur HTTPS temporaire a été testé ; il est redémarré pour la validation du correctif de classement et du scan continu (APK 0.1.1). Aucun serveur permanent ni publication en boutique n’est en place. Le téléchargement et les fonctions de base seront gratuits ; les paiements restent à implémenter.

## Une application, plusieurs formats

Depuis `mobile/` :

| Commande | Résultat attendu | Environnement EAS |
| --- | --- | --- |
| `pnpm build:dev:android` | Client de développement, dépendant de Metro | development |
| `pnpm build:preview:android` | APK de test autonome, sans Expo Go ni Metro | preview |
| `pnpm build:direct:android` | APK de production pour le site | production |
| `pnpm build:store:android` | AAB pour Google Play | production |
| `pnpm build:store:ios` | Build iOS pour l’App Store / TestFlight | production |

Les profils gardent `com.smartshopping.app`, le schéma `smartshopping` et les mêmes fonctionnalités. Le canal public enregistré dans la configuration prépare la future sélection du paiement ; il ne déverrouille aucun droit. Ne pas utiliser ce champ comme preuve d’achat.

Un serveur local avec adresse HTTPS temporaire est désormais disponible pour les essais : voir [Serveur local HTTPS](SERVEUR_LOCAL_HTTPS.md). Son adresse change au redémarrage du tunnel ; prévoir une adresse fixe avant une distribution durable.

## Compilation locale sans compte Expo

Un parcours local est disponible : [APK de test autonome](APK_TEST_LOCAL.md). Il utilise le SDK Android installé sur le PC et une signature locale, avec serveur HTTPS configurable dans l’app de test.

## Prérequis pour un APK construit avec EAS

1. Pour la compilation cloud EAS, créer le compte Expo et associer le projet à EAS. Conserver le UUID de projet dans `app.json` sous `expo.extra.eas.projectId`, ou fournir `EAS_PROJECT_ID` lors de la résolution de configuration. Aucun identifiant de projet fictif n’est enregistré dans le dépôt.
2. Héberger le backend avec stockage persistant, authentification d’appareil et HTTPS. L’OCR nécessite aussi son service. Une app autonome embarque son interface, pas le serveur. Les listes locales restent utilisables hors ligne, mais partage, synchronisation et OCR nécessitent le serveur.
3. Dans les environnements EAS `preview` et `production`, configurer `EXPO_PUBLIC_API_BASE_URL` avec l’adresse réelle de l’API, terminant par `/api/v1`. Cette valeur doit être disponible pour la résolution locale de configuration : visibilité publique/plaintext, puisqu’elle est embarquée dans l’app. Ne jamais y mettre de jeton ni de mot de passe.
4. Configurer les identités de signature. Utiliser une stratégie cohérente pour le site et Google Play : même identifiant de paquet et signatures compatibles sont nécessaires pour une mise à jour sans désinstallation. Si Play App Signing est utilisé, prévoir la compatibilité avec la clé qui signe les APK distribués, pas uniquement la clé d’import. Sauvegarder les clés hors du dépôt.
5. Lancer d’abord `pnpm build:preview:android`, installer le résultat et exécuter la recette ci-dessous. Les builds cloud dépendent du compte et de ses quotas ; aucune compilation cloud n’est lancée automatiquement par les tests.

L’API est vérifiée avant une compilation autonome : absence, HTTP, adresses de boucle locale/émulateur, identifiants, paramètres, fragment ou chemin sans `/api/v1` sont refusés. Ce contrôle syntaxique ne garantit ni la disponibilité du serveur ni la validité de son certificat. Les profils locaux de développement gardent la découverte du PC via Expo Go. Les builds autonomes utilisent l’adresse validée enregistrée dans la configuration publique. Exception explicite pour l’APK local de test : le canal `preview` avec `SMARTSHOPPING_TEST_SERVER=true` permet de démarrer hors ligne, puis de saisir et vérifier le serveur HTTPS dans les réglages. Cette exception est interdite aux canaux `direct` et `store`.

Les variables `SMARTSHOPPING_CHANNEL` sont fixées dans `eas.json`. Pour une compilation ou un export de validation hors EAS, définir explicitement ce canal (`preview`, `direct` ou `store`) et l’URL de l’API ; sans profil ni canal, la configuration reste celle de développement.

## Vérifications locales

```sh
pnpm test:build-config
pnpm typecheck
pnpm test
pnpm test:components
```

La CI mobile inclut le contrôle des profils. L’export du bundle JavaScript et l’inspection des permissions générées ne constituent pas une compilation APK/IPA ou une recette physique.

## Recette du premier APK

- Ouvrir SmartShopping avec Expo Go et Metro arrêtés ; vérifier l’accueil Mes listes.
- Créer et modifier une liste en mode avion, fermer puis rouvrir l’app.
- Revenir en ligne et vérifier la synchronisation, puis l’échange entre deux téléphones.
- Essayer code-barres, invitation et OCR. La caméra est autorisée ; le microphone n’est pas demandé.
- Installer une mise à jour signée de manière compatible et vérifier la conservation des listes, de l’identité et des réglages.
- Vérifier la réception et l’ouverture des liens d’invitation.

Expo Go utilise sa propre base locale : installer l’APK ne transfère pas automatiquement les listes et l’identité du prototype. Utiliser **Réglages → Sauvegarde et restauration** pour exporter les listes avant de supprimer l’environnement de test, puis restaurer leurs copies dans l’APK. Les appartenances aux listes partagées se récupèrent par invitation, pas par cette sauvegarde. Voir [le mode d’emploi](SAUVEGARDE.md). Ne pas désinstaller une version contenant des données importantes pour résoudre un conflit de signature.

## Sources techniques

- [APK avec EAS](https://docs.expo.dev/build-reference/apk/)
- [Profils de compilation](https://docs.expo.dev/build/eas-json/)
- [Variables EAS](https://docs.expo.dev/eas/environment-variables/usage/)
- [Permissions caméra SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/camera/)
