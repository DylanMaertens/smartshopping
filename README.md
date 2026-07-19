# smartshopping

Monorepo de l'application **Liste de courses intelligente**.

## Structure

- `mobile/`: application React Native (TypeScript) orientée offline-first.
- `backend/`: API Rust/Axum (cache-first, proxy Open Food Facts).
- `CAHIER_DES_CHARGES_CORRIGE.md`: décisions techniques consolidées.

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
- [x] Schéma SQLite local (Drizzle)
- [x] Cache produit local compatible Expo Go et moteur de sync (interfaces)


## Progrès supplémentaires

- Backend exposé en librairie (`src/lib.rs`) pour faciliter les tests d'intégration.
- Test smoke API ajouté (`backend/tests/api_smoke.rs`).
- Hook mobile `useOfflineSync` ajouté pour brancher le moteur de synchronisation.

## Point sécurité actuel

- Backend: CORS restreint à `ALLOWED_ORIGIN`, taille de body limitée à 64 KB, headers `nosniff` et `no-referrer`.
- Mobile: identification anonyme par `device_id` UUID v4 local, sans compte obligatoire ni secret embarqué.
- Sync: endpoint désactivé par défaut et validation de `X-Device-Id` côté backend.
