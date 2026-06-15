# Cahier des charges corrigé — Liste de courses intelligente

## 1) Correction technique : rate limiting Open Food Facts

### Problème identifié
L'usage de `Semaphore::new(100)` limite uniquement la **concurrence simultanée** et ne garantit pas une limite de **100 requêtes/minute**.

### Correction recommandée
Utiliser un rate limiter temporel (token bucket), par exemple `governor`, et garder la concurrence séparée (sémaphore facultative).

```rust
use governor::{Quota, RateLimiter};
use nonzero_ext::nonzero;
use std::{num::NonZeroU32, sync::Arc};

pub struct OpenFoodFactsClient {
    client: reqwest::Client,
    limiter: Arc<RateLimiter<governor::state::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>>,
}

impl OpenFoodFactsClient {
    pub fn new() -> Self {
        let quota = Quota::per_minute(nonzero!(100u32));
        Self {
            client: reqwest::Client::new(),
            limiter: Arc::new(RateLimiter::direct(quota)),
        }
    }

    pub async fn get_product(&self, barcode: &str) -> Result<OffProduct, OffError> {
        self.limiter.until_ready().await; // vrai contrôle temporel
        let url = format!("https://world.openfoodfacts.org/api/v2/product/{barcode}");
        let res = self.client.get(url).send().await?;
        // ... parse + mapping erreurs
        todo!()
    }
}
```

---

## 2) Décision validée : backend local-first par le cache

### Politique d'accès produit (backend)
1. Lire Redis (ou Moka fallback)
2. Si hit non expiré: renvoyer immédiatement
3. Si miss: appeler OFF
4. Si succès OFF: normaliser + stocker (TTL 7 jours)
5. Si OFF échoue mais donnée stale présente: renvoyer stale
6. Sinon: erreur métier contrôlée

### Contrat API conseillé
```json
{
  "barcode": "3017620422003",
  "product_name": "Nutella",
  "categories": ["pates-a-tartiner"],
  "cached": true,
  "stale": false,
  "source": "redis",
  "fetched_at": "2026-05-05T00:00:00Z"
}
```

---

## 3) Identification utilisateur : strict minimum

### Objectif
Assurer synchronisation et partage sans compte obligatoire.

### Recommandation MVP
- Générer un `device_id` UUID v4 au premier lancement
- Le stocker localement (MMKV)
- L'envoyer dans `X-Device-Id` à chaque appel sync/partage
- Créer côté backend un profil anonyme lié au `device_id`

### Avantages
- zéro friction onboarding
- support offline/sync
- confidentialité préservée

---

## 4) Changements suggérés

### Priorité P0
- Implémenter vrai rate limiting OFF (100 req/min)
- Implémenter cache-first + fallback réseau
- Ajouter `device_id` anonyme et contrat API associé
- Définir stratégie conflits sync: `last_write_wins` + `deleted_at`

### Priorité P1
- Ajouter table locale `sync_ops` (journal d'opérations)
- Normaliser erreurs API (`code`, `message`, `retryable`)
- Ajouter observabilité minimale: `request_id`, `cache_hit_rate`, latence OFF

---

## 5) Décision Expo : Managed vs Prebuild

### Recommandation
**Expo Prebuild** dès le démarrage du projet.

### Justification
- Le projet utilise des capacités natives sensibles (OCR/caméra/MMKV/SQLite)
- Prebuild conserve la DX Expo (EAS, tooling) tout en donnant le contrôle natif
- Réduit le risque de migration tardive Managed -> Bare

### Décision de cadrage
- MVP en Expo + Prebuild
- iOS gardé compatible dès la phase d'architecture

---

## 6) Résumé des décisions validées
- ✅ Rate limiting OFF corrigé (temporel, pas seulement concurrence)
- ✅ Backend cache-first, réseau en fallback si nécessaire
- ✅ Identification minimale par `device_id` anonyme
- ✅ Expo Prebuild recommandé pour ce scope technique
