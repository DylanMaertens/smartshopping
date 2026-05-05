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
