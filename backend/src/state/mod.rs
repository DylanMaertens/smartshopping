use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::{Duration, Instant},
};

use moka::future::Cache;
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::{
    config::Config,
    db::create_optional_pool,
    handlers::sync::SyncItem,
    models::product::ProductResponse,
    services::{
        device_registry::DeviceRegistry, openfoodfacts::OpenFoodFactsClient,
        redis_cache::RedisCache, sharing::SharingService,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub products_cache: Cache<String, ProductResponse>,
    pub redis_cache: Option<RedisCache>,
    pub db_pool: Option<PgPool>,
    pub off_client: OpenFoodFactsClient,
    pub synced_items: Cache<String, Vec<SyncItem>>,
    pub metrics: Arc<AppMetrics>,
    pub device_registry: Arc<Mutex<DeviceRegistry>>,
    pub sharing: SharingService,
    pub api_rate_limiter: Arc<ApiRateLimiter>,
    pub signed_request_ids: Cache<String, ()>,
    pub device_auth_secrets: Cache<String, String>,
}

#[derive(Default)]
pub struct AppMetrics {
    product_cache_hits: AtomicU64,
    product_cache_misses: AtomicU64,
    off_lookup_successes: AtomicU64,
    off_lookup_failures: AtomicU64,
    sync_attempts: AtomicU64,
    sync_successes: AtomicU64,
    api_rate_limit_rejections: AtomicU64,
    http_requests: StdMutex<HashMap<&'static str, HttpEndpointMetrics>>,
}

#[derive(Default)]
struct HttpEndpointMetrics {
    count: u64,
    duration_micros: u64,
    buckets: [u64; 6],
}

const HTTP_BUCKETS_MS: [u64; 6] = [10, 50, 100, 200, 500, 1_000];

#[derive(Clone, Copy)]
pub enum MetricKind {
    ProductCacheHit,
    ProductCacheMiss,
    OffLookupSuccess,
    OffLookupFailure,
    SyncAttempt,
    SyncSuccess,
    ApiRateLimitRejection,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let off_client = OpenFoodFactsClient::new(
            config.off_base_url.clone(),
            config.off_rate_limit_per_minute,
            config.off_max_retries,
        );
        let products_cache = Cache::builder()
            .max_capacity(config.product_cache_capacity)
            .time_to_live(Duration::from_secs(config.cache_ttl_seconds))
            .build();
        let redis_cache = config
            .redis_url
            .as_deref()
            .and_then(|url| match RedisCache::new(url) {
                Ok(cache) => Some(cache),
                Err(error) => {
                    tracing::warn!(%error, "redis cache disabled: invalid REDIS_URL");
                    None
                }
            });

        let db_pool = create_optional_pool(config.database_url.as_deref());

        let synced_items = Cache::builder()
            .max_capacity(10_000)
            .time_to_live(Duration::from_secs(config.cache_ttl_seconds))
            .build();

        let device_registry = DeviceRegistry::load(config.device_registry_path.clone());
        let api_rate_limiter = Arc::new(ApiRateLimiter::new(config.api_rate_limit_per_minute));
        let signed_request_ids = Cache::builder()
            .max_capacity(100_000)
            .time_to_live(Duration::from_secs(10 * 60))
            .build();
        let device_auth_secrets = Cache::builder()
            .max_capacity(100_000)
            .time_to_live(Duration::from_secs(15 * 60))
            .build();

        Self {
            config,
            products_cache,
            redis_cache,
            db_pool,
            off_client,
            synced_items,
            metrics: Arc::new(AppMetrics::default()),
            device_registry: Arc::new(Mutex::new(device_registry)),
            sharing: SharingService::default(),
            api_rate_limiter,
            signed_request_ids,
            device_auth_secrets,
        }
    }

    pub fn record_metric(&self, metric: MetricKind) {
        self.metrics.record(metric);
    }

    pub async fn enroll_device(&self, device_id: &str) -> Result<Option<String>, String> {
        let secret = if let Some(pool) = &self.db_pool {
            crate::services::device_auth::enroll(pool, device_id)
                .await
                .map_err(|error| error.to_string())?
        } else {
            self.device_registry
                .lock()
                .await
                .enroll(device_id)
                .map_err(|error| error.to_string())?
        };
        if let Some(value) = &secret {
            self.device_auth_secrets
                .insert(device_id.to_string(), value.clone())
                .await;
        }
        Ok(secret)
    }

    pub async fn device_secret(&self, device_id: &str) -> Result<Option<String>, String> {
        if let Some(secret) = self.device_auth_secrets.get(device_id).await {
            return Ok(Some(secret));
        }
        let secret = if let Some(pool) = &self.db_pool {
            crate::services::device_auth::get_secret(pool, device_id)
                .await
                .map_err(|error| error.to_string())?
        } else {
            self.device_registry
                .lock()
                .await
                .get(device_id)
                .and_then(|profile| profile.auth_secret)
        };
        if let Some(value) = &secret {
            self.device_auth_secrets
                .insert(device_id.to_string(), value.clone())
                .await;
        }
        Ok(secret)
    }

    pub async fn allow_api_request(&self, client: &str) -> bool {
        if let Some(redis) = &self.redis_cache {
            match redis
                .allow_request(client, self.config.api_rate_limit_per_minute)
                .await
            {
                Ok(allowed) => return allowed,
                Err(error) => {
                    tracing::warn!(%error, "distributed rate limiter unavailable; using local fallback")
                }
            }
        }
        self.api_rate_limiter.allow(client)
    }

    pub async fn claim_signed_request(&self, request_id: &str) -> Result<bool, String> {
        if let Some(redis) = &self.redis_cache {
            return redis
                .claim_request_id(request_id)
                .await
                .map_err(|error| error.to_string());
        }
        Ok(self
            .signed_request_ids
            .entry(request_id.to_string())
            .or_insert(())
            .await
            .is_fresh())
    }
}

pub struct ApiRateLimiter {
    limit: u32,
    clients: StdMutex<HashMap<String, RateWindow>>,
}

struct RateWindow {
    started_at: Instant,
    requests: u32,
}

impl ApiRateLimiter {
    fn new(limit: u32) -> Self {
        Self {
            limit,
            clients: StdMutex::new(HashMap::new()),
        }
    }

    pub fn allow(&self, client: &str) -> bool {
        let mut clients = self.clients.lock().expect("rate limiter mutex poisoned");
        if clients.len() >= 10_000 {
            clients.retain(|_, window| window.started_at.elapsed() < Duration::from_secs(60));
        }
        let key = if clients.len() >= 10_000 && !clients.contains_key(client) {
            "overflow"
        } else {
            client
        };
        let window = clients.entry(key.to_string()).or_insert(RateWindow {
            started_at: Instant::now(),
            requests: 0,
        });
        if window.started_at.elapsed() >= Duration::from_secs(60) {
            window.started_at = Instant::now();
            window.requests = 0;
        }
        if window.requests >= self.limit {
            return false;
        }
        window.requests += 1;
        true
    }
}

impl AppMetrics {
    pub fn record(&self, metric: MetricKind) {
        match metric {
            MetricKind::ProductCacheHit => self.product_cache_hits.fetch_add(1, Ordering::Relaxed),
            MetricKind::ProductCacheMiss => {
                self.product_cache_misses.fetch_add(1, Ordering::Relaxed)
            }
            MetricKind::OffLookupSuccess => {
                self.off_lookup_successes.fetch_add(1, Ordering::Relaxed)
            }
            MetricKind::OffLookupFailure => {
                self.off_lookup_failures.fetch_add(1, Ordering::Relaxed)
            }
            MetricKind::SyncAttempt => self.sync_attempts.fetch_add(1, Ordering::Relaxed),
            MetricKind::SyncSuccess => self.sync_successes.fetch_add(1, Ordering::Relaxed),
            MetricKind::ApiRateLimitRejection => self
                .api_rate_limit_rejections
                .fetch_add(1, Ordering::Relaxed),
        };
    }

    pub fn record_http_request(&self, endpoint: &'static str, elapsed: Duration) {
        let micros = elapsed.as_micros().min(u128::from(u64::MAX)) as u64;
        let mut metrics = self.http_requests.lock().expect("metrics mutex poisoned");
        let endpoint_metrics = metrics.entry(endpoint).or_default();
        endpoint_metrics.count += 1;
        endpoint_metrics.duration_micros = endpoint_metrics.duration_micros.saturating_add(micros);

        for (index, upper_bound_ms) in HTTP_BUCKETS_MS.iter().enumerate() {
            if micros <= upper_bound_ms * 1_000 {
                endpoint_metrics.buckets[index] += 1;
            }
        }
    }

    pub fn render_prometheus(&self) -> String {
        let cache_hits = self.product_cache_hits.load(Ordering::Relaxed);
        let cache_misses = self.product_cache_misses.load(Ordering::Relaxed);
        let cache_total = cache_hits + cache_misses;
        let cache_hit_ratio = if cache_total == 0 {
            0.0
        } else {
            cache_hits as f64 / cache_total as f64
        };
        let mut output = format!(
            "# TYPE smartshopping_product_cache_hits_total counter\nsmartshopping_product_cache_hits_total {cache_hits}\n# TYPE smartshopping_product_cache_misses_total counter\nsmartshopping_product_cache_misses_total {cache_misses}\n# TYPE smartshopping_product_cache_hit_ratio gauge\nsmartshopping_product_cache_hit_ratio {cache_hit_ratio:.6}\n# TYPE smartshopping_off_lookup_successes_total counter\nsmartshopping_off_lookup_successes_total {}\n# TYPE smartshopping_off_lookup_failures_total counter\nsmartshopping_off_lookup_failures_total {}\n# TYPE smartshopping_sync_attempts_total counter\nsmartshopping_sync_attempts_total {}\n# TYPE smartshopping_sync_successes_total counter\nsmartshopping_sync_successes_total {}\n# TYPE smartshopping_api_rate_limit_rejections_total counter\nsmartshopping_api_rate_limit_rejections_total {}\n# TYPE smartshopping_http_request_duration_seconds histogram\n",
            self.off_lookup_successes.load(Ordering::Relaxed),
            self.off_lookup_failures.load(Ordering::Relaxed),
            self.sync_attempts.load(Ordering::Relaxed),
            self.sync_successes.load(Ordering::Relaxed),
            self.api_rate_limit_rejections.load(Ordering::Relaxed),
        );

        let metrics = self.http_requests.lock().expect("metrics mutex poisoned");
        for (endpoint, endpoint_metrics) in metrics.iter() {
            for (index, upper_bound_ms) in HTTP_BUCKETS_MS.iter().enumerate() {
                output.push_str(&format!(
                    "smartshopping_http_request_duration_seconds_bucket{{endpoint=\"{endpoint}\",le=\"{}\"}} {}\n",
                    *upper_bound_ms as f64 / 1_000.0,
                    endpoint_metrics.buckets[index]
                ));
            }
            output.push_str(&format!(
                "smartshopping_http_request_duration_seconds_bucket{{endpoint=\"{endpoint}\",le=\"+Inf\"}} {}\nsmartshopping_http_request_duration_seconds_sum{{endpoint=\"{endpoint}\"}} {:.6}\nsmartshopping_http_request_duration_seconds_count{{endpoint=\"{endpoint}\"}} {}\n",
                endpoint_metrics.count,
                endpoint_metrics.duration_micros as f64 / 1_000_000.0,
                endpoint_metrics.count,
            ));
        }
        output
    }
}
