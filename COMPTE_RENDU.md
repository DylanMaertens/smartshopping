# Compte rendu d'avancement

## Ce qui a été fait jusqu'ici

### 1) Cadrage et documentation
- Rédaction d'un cahier corrigé (`CAHIER_DES_CHARGES_CORRIGE.md`) avec:
  - correction du rate limiting (temporel, pas uniquement concurrence),
  - stratégie backend cache-first,
  - identification minimale via `device_id`,
  - recommandation Expo Prebuild.

### 2) Socle backend Rust/Axum
- Création de la base backend (`backend/`) avec:
  - config centralisée (`Config::from_env`),
  - routes API (`/health`, `/products`, `/categories`, `/sync` optionnel),
  - handlers de base,
  - modèle `ProductResponse`,
  - `AppState` avec cache mémoire.

### 3) Socle mobile Expo
- Création du squelette mobile (`mobile/`) avec:
  - bootstrap Expo (`App.tsx`, `index.js`),
  - schéma SQLite local,
  - cache MMKV,
  - client API backend,
  - moteur de sync + hook `useOfflineSync`.

### 4) Correctifs de stabilité
- Correction d'un bug Rust (`E0382`) dans le handler produits.
- Vérification de la compilation/tests backend après correction.

### 5) Audit et durcissement sécurité
- CORS permissif supprimé et remplacé par CORS restrictive configurable.
- Limitation de taille de body (64 KB).
- Endpoint `/sync` désactivé par défaut via feature flag env.
- Validation stricte des barcodes sur `/products/:barcode`.
- Ajout d'un contrôle `X-Device-Id` (UUID) pour l'endpoint `/sync`.
- Ajout/renforcement des tests d'intégration sécurité.

## État actuel
- Backend: socle fonctionnel + tests d'intégration de base.
- Mobile: socle initial prêt pour itération UI/DB/sync.
- Sécurité: premiers garde-fous en place côté API.

## Prochaines étapes recommandées
1. Ajouter un vrai client Open Food Facts (avec retry/backoff + rate limiting temporel).
2. Remplacer le cache mémoire backend par Redis/Moka hybride.
3. Implémenter les tables SQLite complètes (`items`, `categories`, `products_cache`).
4. Brancher le flux sync réel (pending changes + conflits LWW).
5. Ajouter authentification anonyme durable (mapping device_id côté backend persistant).
6. Ajouter observabilité (request-id, métriques latence, cache hit ratio).

## Mise à jour récente
- Ajout d'un client Open Food Facts backend (`reqwest`) avec timeout et user-agent.
- Intégration optionnelle du proxy OFF dans `/api/v1/products/:barcode` via `ENABLE_OFF_PROXY`.
- En cas de cache miss et OFF activé, la réponse est enrichie depuis OFF puis mise en cache mémoire.
- OFF reste désactivé par défaut pour garder un mode local/maîtrisé en développement.
