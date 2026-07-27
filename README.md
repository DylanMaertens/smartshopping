# smartshopping

Monorepo de l'application **Liste de courses intelligente**.

## Structure

- `mobile/`: application React Native (TypeScript) orientée offline-first.
- `backend/`: API Rust/Axum (cache-first, proxy Open Food Facts).
- `CAHIER_DES_CHARGES_CORRIGE.md`: décisions techniques consolidées.
- [`COMPTE_RENDU.html`](COMPTE_RENDU.html): tableau de bord d’avancement autonome, consultable dans un navigateur et imprimable en PDF.

## Démarrage rapide

### Backend

```bash
cd backend
cargo run
```

API disponible sur `http://127.0.0.1:3000`.

### Mobile

```bash
cd mobile
pnpm install
pnpm start
```

Par défaut, l'app utilise `http://10.0.2.2:3000/api/v1` sur émulateur Android et `http://127.0.0.1:3000/api/v1` ailleurs. Sur un téléphone physique, lance Expo avec `EXPO_PUBLIC_API_BASE_URL=http://<IP_DE_TON_PC>:3000/api/v1 pnpm start`.

## Roadmap MVP (socle livré)

- [x] Arborescence mobile/backend conforme au cadrage
- [x] Health check backend Axum
- [x] Endpoints produits/catégories/sync (stubs)
- [x] Persistance SQLite locale des listes et tombstones
- [x] Cache produit SQLite avec TTL et journal durable des opérations de sync
- [x] État réseau réel, statut de synchronisation détaillé et timeout réseau
- [x] Reprise automatique et protégée de la sync au retour du réseau
- [x] Plusieurs listes locales avec création, renommage, sélection et archivage
- [x] Tests mobiles pour catégorisation, identité anonyme et fusion LWW
- [x] Tests de composants pour la gestion des listes et le statut de sync
- [x] Tests d'intégration du schéma SQLite, du multi-listes et du cache


## Progrès supplémentaires

- Backend exposé en librairie (`src/lib.rs`) pour faciliter les tests d'intégration.
- Test smoke API ajouté (`backend/tests/api_smoke.rs`).
- Hook mobile `useOfflineSync` ajouté pour brancher le moteur de synchronisation.

## Point sécurité actuel

- Backend: CORS restreint à `ALLOWED_ORIGIN`, taille de body limitée à 64 KB, headers `nosniff` et `no-referrer`.
- Mobile: identification anonyme par `device_id` UUID v4 local, sans compte obligatoire ni secret embarqué.
- Sync: endpoint désactivé par défaut et validation de `X-Device-Id` côté backend.

## Observabilité backend

- Chaque réponse API contient `X-Request-Id` pour corréler les logs mobile/backend.
- `GET /metrics` expose des compteurs texte compatibles Prometheus pour cache produit, Open Food Facts et sync.

## Persistance backend optionnelle

Le backend peut fonctionner sans base pour le développement rapide. Pour rendre la synchronisation durable, configure `DATABASE_URL`, applique les migrations SQLx dans `backend/migrations`, puis démarre l'API avec `ENABLE_SYNC_ENDPOINT=true`.

```bash
cd backend
DATABASE_URL=postgresql://user:password@localhost:5432/smartshopping cargo run
```

Au démarrage, le backend vérifie la connexion et applique automatiquement les migrations. Un test d'intégration destructif ciblé est disponible pour une base PostgreSQL jetable :

```bash
cd backend
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/smartshopping_test \
  cargo test --test postgres_sync -- --ignored
```
