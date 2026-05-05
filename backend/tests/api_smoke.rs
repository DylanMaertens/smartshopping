use axum::{body::Body, http::{Request, StatusCode}};
use tower::ServiceExt;

use shopping_list_backend::{config::Config, routes::create_router, state::AppState};

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let state = AppState::new(Config::from_env());
    let app = create_router(state);

    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn rejects_invalid_barcode() {
    let state = AppState::new(Config::from_env());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/products/abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn sync_endpoint_disabled_by_default() {
    let state = AppState::new(Config::from_env());
    let app = create_router(state);

    let response = app
        .oneshot(Request::builder().method("POST").uri("/api/v1/sync").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn sync_requires_device_id_when_enabled() {
    let config = Config {
        host: "0.0.0.0".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
    };

    let state = AppState::new(config);
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sync")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"list_id":"a","last_sync":1}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
