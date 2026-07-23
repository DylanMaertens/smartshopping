use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderValue, Method},
    middleware::from_fn,
    routing::{get, post},
    Router,
};
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};

use crate::{handlers, middleware, state::AppState};

const DEVICE_ID_HEADER: &str = "x-device-id";

pub fn create_router(state: AppState) -> Router {
    let allowed_origin = state
        .config
        .allowed_origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:8081"));

    let cors = CorsLayer::new()
        .allow_origin(allowed_origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            header::CONTENT_TYPE,
            header::HeaderName::from_static(DEVICE_ID_HEADER),
        ]);

    let mut router = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/metrics", get(handlers::metrics::metrics))
        .route(
            "/api/v1/products/:barcode",
            get(handlers::products::get_product),
        )
        .route(
            "/api/v1/categories",
            get(handlers::categories::get_categories),
        )
        .route(
            "/api/v1/categories/classify",
            post(handlers::categories::classify_product),
        );

    if state.config.enable_sync_endpoint {
        router = router.route("/api/v1/sync", post(handlers::sync::sync_list));
    }

    router
        .with_state(state)
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(from_fn(middleware::request_id))
}
