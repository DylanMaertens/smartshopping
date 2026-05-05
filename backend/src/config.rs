#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub cache_ttl_seconds: u64,
    pub allowed_origin: String,
    pub enable_sync_endpoint: bool,
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
            allowed_origin: std::env::var("ALLOWED_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:8081".to_string()),
            enable_sync_endpoint: std::env::var("ENABLE_SYNC_ENDPOINT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(false),
        }
    }
}
