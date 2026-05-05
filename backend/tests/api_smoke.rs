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
