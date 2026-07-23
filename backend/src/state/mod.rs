use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use moka::future::Cache;
use tokio::sync::Mutex;

use crate::{
    config::Config,
    handlers::sync::SyncItem,
    models::product::ProductResponse,
    services::{device_registry::DeviceRegistry, openfoodfacts::OpenFoodFactsClient},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub products_cache: Cache<String, ProductResponse>,
    pub off_client: OpenFoodFactsClient,
    pub synced_items: Cache<String, Vec<SyncItem>>,
    pub metrics: Arc<AppMetrics>,
    pub device_registry: Arc<Mutex<DeviceRegistry>>,
}

#[derive(Default)]
pub struct AppMetrics {
    product_cache_hits: AtomicU64,
    product_cache_misses: AtomicU64,
    off_lookup_successes: AtomicU64,
    off_lookup_failures: AtomicU64,
    sync_attempts: AtomicU64,
    sync_successes: AtomicU64,
}

#[derive(Clone, Copy)]
pub enum MetricKind {
    ProductCacheHit,
    ProductCacheMiss,
    OffLookupSuccess,
    OffLookupFailure,
    SyncAttempt,
    SyncSuccess,
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
        let synced_items = Cache::builder()
            .max_capacity(10_000)
            .time_to_live(Duration::from_secs(config.cache_ttl_seconds))
            .build();

        let device_registry = DeviceRegistry::load(config.device_registry_path.clone());

        Self {
            config,
            products_cache,
            off_client,
            synced_items,
            metrics: Arc::new(AppMetrics::default()),
            device_registry: Arc::new(Mutex::new(device_registry)),
        }
    }

    pub fn record_metric(&self, metric: MetricKind) {
        self.metrics.record(metric);
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
        };
    }

    pub fn render_prometheus(&self) -> String {
        format!(
            "# TYPE smartshopping_product_cache_hits_total counter\nsmartshopping_product_cache_hits_total {}\n# TYPE smartshopping_product_cache_misses_total counter\nsmartshopping_product_cache_misses_total {}\n# TYPE smartshopping_off_lookup_successes_total counter\nsmartshopping_off_lookup_successes_total {}\n# TYPE smartshopping_off_lookup_failures_total counter\nsmartshopping_off_lookup_failures_total {}\n# TYPE smartshopping_sync_attempts_total counter\nsmartshopping_sync_attempts_total {}\n# TYPE smartshopping_sync_successes_total counter\nsmartshopping_sync_successes_total {}\n",
            self.product_cache_hits.load(Ordering::Relaxed),
            self.product_cache_misses.load(Ordering::Relaxed),
            self.off_lookup_successes.load(Ordering::Relaxed),
            self.off_lookup_failures.load(Ordering::Relaxed),
            self.sync_attempts.load(Ordering::Relaxed),
            self.sync_successes.load(Ordering::Relaxed),
        )
    }
}
