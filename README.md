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

## Roadmap MVP (socle livré)

- [x] Arborescence mobile/backend conforme au cadrage
- [x] Health check backend Axum
- [x] Endpoints produits/catégories/sync (stubs)
- [x] Schéma SQLite local (Drizzle)
- [x] Cache MMKV et moteur de sync (interfaces)


## Progrès supplémentaires

- Backend exposé en librairie (`src/lib.rs`) pour faciliter les tests d'intégration.
- Test smoke API ajouté (`backend/tests/api_smoke.rs`).
- Hook mobile `useOfflineSync` ajouté pour brancher le moteur de synchronisation.
