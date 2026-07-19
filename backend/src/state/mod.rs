use std::time::Duration;

use moka::future::Cache;

use crate::{
    config::Config, handlers::sync::SyncItem, models::product::ProductResponse,
    services::openfoodfacts::OpenFoodFactsClient,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub products_cache: Cache<String, ProductResponse>,
    pub off_client: OpenFoodFactsClient,
    pub synced_items: Cache<String, Vec<SyncItem>>,
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

        Self {
            config,
            products_cache,
            off_client,
            synced_items,
        }
    }
}
