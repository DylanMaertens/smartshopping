#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub cache_ttl_seconds: u64,
    pub product_cache_capacity: u64,
    pub allowed_origin: String,
    pub enable_sync_endpoint: bool,
    pub off_base_url: String,
    pub enable_off_proxy: bool,
    pub off_rate_limit_per_minute: u32,
    pub off_max_retries: u32,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
            cache_ttl_seconds: std::env::var("CACHE_TTL_SECONDS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(604800),
            product_cache_capacity: std::env::var("PRODUCT_CACHE_CAPACITY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10_000),
            allowed_origin: std::env::var("ALLOWED_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:8081".to_string()),
            enable_sync_endpoint: std::env::var("ENABLE_SYNC_ENDPOINT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(false),
            off_base_url: std::env::var("OFF_BASE_URL")
                .unwrap_or_else(|_| "https://world.openfoodfacts.org/api/v2".to_string()),
            enable_off_proxy: std::env::var("ENABLE_OFF_PROXY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(true),
            off_rate_limit_per_minute: std::env::var("OFF_RATE_LIMIT_PER_MINUTE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            off_max_retries: std::env::var("OFF_MAX_RETRIES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2),
        }
    }
}
