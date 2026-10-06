# Serveur local avec HTTPS temporaire

Le backend Rust, PostgreSQL, les listes, les identités et l’OCR restent sur le PC. `cloudflared` crée un tunnel sortant : le téléphone utilise HTTPS vers Cloudflare, puis le tunnel chiffré rejoint le PC. Le dernier trajet vers le backend utilise HTTP sur la boucle locale. Cloudflare termine TLS et sert de relais ; ce n’est pas du chiffrement de bout en bout entre l’app et le backend.

## Utilisation sur cette machine

Depuis le dossier du projet :

```bash
python3 ops/local-https.py
```

Le lanceur réutilise le backend déjà actif sur le port 3000. S’il n’est pas actif, il lance PostgreSQL et le backend compilé, avec l’authentification des appareils obligatoire. Il réutilise `.local-dev/postgres`, `device-registry.json` et `device-secret-key` : il ne recrée pas les identités des téléphones.

Pour démarrer aussi l’interface Expo Go, ouvrir un deuxième terminal dans le projet :

```bash
bash ops/start-mobile-https.sh
```

Ce second lanceur affiche le QR à scanner dans Expo Go. Le téléphone et le PC restent sur le même Wi-Fi pour charger l’interface, tandis que les appels API passent par HTTPS.

Après vérification du HTTPS et du refus d’une synchronisation anonyme, l’adresse est affichée et écrite dans `mobile/.local-api.json`. La configuration Expo la donne en priorité à l’app en développement, même si une ancienne session Expo a encore l’adresse HTTP du réseau local dans son environnement. **Recharger Expo Go sur les deux appareils.** Si Expo conserve un ancien manifeste, relancer Expo puis recharger l’app.

```bash
python3 ops/local-https.py status
python3 ops/local-https.py stop
```

`Ctrl+C` arrête également le tunnel. Le lanceur arrête seulement les services qu’il a lui-même lancés ; un backend/PostgreSQL déjà actif reste disponible. Les données sont conservées. Une seule session HTTPS est autorisée à la fois. Fermer le terminal ou mettre le PC en veille interrompt le service ; aucun service de démarrage automatique n’est installé.

La configuration locale est supprimée à l’arrêt normal pour revenir au fonctionnement Wi-Fi. Après un arrêt brutal, relancer le lanceur ou supprimer `mobile/.local-api.json` pour revenir au HTTP local. Les builds autonomes continuent à demander leur propre `EXPO_PUBLIC_API_BASE_URL` : ils n’embarquent pas automatiquement l’adresse temporaire.

## Installation et dépendances

Sur cette machine, les chemins du backend compilé et des outils PostgreSQL sont enregistrés dans `.local-dev/server-tools.json`. Ce fichier privé, non versionné, permet de relancer sans réinstaller les outils. Après modification du backend, le recompiler avant de relancer les services qui l’utilisent.

Pour réinstaller le tunnel :

```bash
bash ops/install-local-https.sh
```

L’installateur Linux x86_64 télécharge **cloudflared 2026.9.3** depuis le dépôt officiel et vérifie son SHA-256 avant de le rendre exécutable. Il ne nécessite pas `sudo`. Dépendances du lanceur : Python 3, curl, PostgreSQL (`initdb`, `pg_ctl`, `pg_isready`, `psql`, `createdb`) et le binaire backend compilé. Les outils PostgreSQL peuvent être dans le PATH ; le chemin `backend` doit être renseigné dans `server-tools.json` si le serveur n’est pas déjà lancé. L’OCR est activé au démarrage si son environnement et ses modèles existent dans `.local-dev/ocr`.

Le backend nouvellement lancé écoute uniquement sur `127.0.0.1`. PostgreSQL utilise le socket Unix local. Si le lanceur se rattache à l’ancienne session Wi-Fi, il ne change pas ses adresses d’écoute. Le port 3000 doit être libre ou déjà occupé par le backend SmartShopping authentifié.

Journaux : `.local-dev/https/tunnel.log`, et `backend.log` / `postgres.log` si ces services ont été démarrés par ce lanceur. Les données, outils téléchargés et adresses temporaires sont ignorés par Git.

## Limites de cette solution de test

- L’adresse change à chaque nouveau tunnel. Elle cesse de répondre quand le tunnel s’arrête.
- Le PC doit rester allumé et connecté à Internet. Le tunnel ne maintient pas automatiquement le PC éveillé.
- L’API devient accessible depuis Internet. Les listes restent soumises à l’authentification et aux droits existants. Le lanceur vérifie le refus HTTP 401 avant d’ouvrir le tunnel.
- Un nouveau nom peut mettre un peu de temps à apparaître dans le DNS. Le contrôle de démarrage peut utiliser le DNS public via HTTPS tout en vérifiant normalement le certificat TLS. Cela ne modifie pas le DNS du PC ou du téléphone. Si le Wi-Fi ne résout pas encore l’adresse, attendre ou essayer la 4G/5G ; Expo Go a toutefois encore besoin de joindre son serveur de développement pour charger l’interface.
- Le tunnel transporte l’API, pas le serveur Expo. Un APK autonome permettra de tester hors du Wi-Fi sans charger l’interface depuis le PC.
- Quick Tunnels est prévu pour les essais, sans garantie de disponibilité (200 requêtes simultanées au maximum, pas de SSE). L’actualisation périodique actuelle de l’app utilise des requêtes HTTP classiques.

Pour un usage durable, passer à une adresse fixe avec domaine et tunnel nommé, ou au VPS prévu.

Sources : [Quick Tunnels — Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [version officielle cloudflared 2026.9.3](https://github.com/cloudflare/cloudflared/releases/tag/2026.9.3).

## Validation du 4 octobre 2026

Le démarrage avec réutilisation de la session existante, puis le démarrage autonome de PostgreSQL et du backend compilé ont été vérifiés sur cette machine. Un parcours réel via HTTPS a enrôlé deux appareils de test, créé une liste, partagé une invitation, rejoint, modifié et récupéré les articles ; la liste de test a ensuite été supprimée. Le manifeste Expo Go a été contrôlé pour vérifier l’adresse API HTTPS. Les tests du lanceur et des profils Expo couvrent notamment l’authentification obligatoire, la propagation DNS et l’absence d’adresse temporaire implicite dans les builds autonomes.
