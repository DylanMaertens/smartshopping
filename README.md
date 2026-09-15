# SmartShopping

Monorepo de l’application mobile **Liste de courses intelligente**.

> **Suivi du projet :** l’état fonctionnel, les validations et les prochaines étapes sont publiés uniquement dans [`COMPTE_RENDU.html`](COMPTE_RENDU.html). Le présent README reste volontairement limité à l’installation et à l’exploitation du dépôt.

## Références

- [`CAHIER_DES_CHARGES_CORRIGE.md`](CAHIER_DES_CHARGES_CORRIGE.md) : exigences et décisions d’architecture de référence.
- [`COMPTE_RENDU.html`](COMPTE_RENDU.html) : artefact d’avancement autonome, consultable dans un navigateur et imprimable en PDF.
- `mobile/` : application Expo / React Native en TypeScript.
- `backend/` : API Rust / Axum.

## Prérequis

- Rust et Cargo ;
- Node.js et pnpm ;
- Expo Go ou un émulateur Android pour le développement mobile ;
- PostgreSQL et Redis uniquement pour tester les services optionnels correspondants.

## Démarrage du backend

```bash
cd backend
cp .env.example .env
cargo run
```

Par défaut, l’API écoute sur `http://127.0.0.1:3000`. Les variables disponibles et leurs valeurs de développement sont décrites dans [`backend/.env.example`](backend/.env.example).

### PostgreSQL optionnel

Sans `DATABASE_URL`, le backend reste utilisable pour le développement local. Lorsqu’une URL PostgreSQL est fournie, le backend vérifie la connexion et applique automatiquement les migrations embarquées avant de servir les requêtes.

```bash
cd backend
DATABASE_URL=postgresql://user:password@localhost:5432/smartshopping \
ENABLE_SYNC_ENDPOINT=true \
cargo run
```

Le test PostgreSQL nécessite une base jetable :

```bash
cd backend
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/smartshopping_test \
  cargo test --test postgres_sync -- --ignored
```

## Démarrage de l’application mobile

```bash
cd mobile
pnpm install --frozen-lockfile
pnpm start
```

Adresses backend utilisées par défaut :

- émulateur Android : `http://10.0.2.2:3000/api/v1` ;
- autres environnements locaux : `http://127.0.0.1:3000/api/v1`.

Sur un téléphone physique, expose l’adresse IP locale de la machine qui exécute le backend :

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://<IP_LOCALE>:3000/api/v1 pnpm start
```

## Vérifications

```bash
# Backend
cd backend
cargo fmt --check
cargo test --tests

# Mobile
cd mobile
pnpm typecheck
pnpm test
pnpm test:components
pnpm test:integration
```

## Règle de maintenance documentaire

- `README.md` décrit uniquement l’accès au dépôt, son démarrage et ses commandes stables.
- `CAHIER_DES_CHARGES_CORRIGE.md` constitue le référentiel produit et technique ; il ne change qu’en cas de nouvelle décision de cadrage validée.
- `COMPTE_RENDU.html` est l’unique source pour les fonctionnalités livrées, les résultats de validation, les points d’attention et la feuille de route.
