use shopping_list_backend::{config::Config, state::AppState};

fn config() -> Config {
    Config {
        host: "127.0.0.1".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        product_cache_capacity: 10,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
        off_base_url: "http://127.0.0.1:1".into(),
        enable_off_proxy: false,
        off_rate_limit_per_minute: 1,
        off_max_retries: 0,
        device_registry_path: std::env::temp_dir()
            .join("failure-registry.json")
            .display()
            .to_string(),
        redis_url: Some("redis://127.0.0.1:1".into()),
        database_url: Some("postgres://invalid:invalid@127.0.0.1:1/invalid".into()),
        metrics_token: None,
        api_rate_limit_per_minute: 2,
        require_device_signatures: true,
    }
}

#[tokio::test]
async fn anti_replay_fails_closed_when_redis_is_unavailable() {
    let state = AppState::new(config());
    assert!(state
        .claim_signed_request("unreachable-redis")
        .await
        .is_err());
}

#[tokio::test]
async fn enrollment_fails_closed_when_postgres_is_unavailable() {
    let state = AppState::new(config());
    assert!(state
        .enroll_device("d40441e3-22d8-4c59-b5c6-dd860b48bc54")
        .await
        .is_err());
}

#[tokio::test]
async fn rate_limit_uses_bounded_local_fallback_when_redis_is_unavailable() {
    let state = AppState::new(config());
    assert!(state.allow_api_request("device").await);
    assert!(state.allow_api_request("device").await);
    assert!(!state.allow_api_request("device").await);
}
