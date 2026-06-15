use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    routing::{get, post},
    Router,
};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};

use crate::{handlers, state::AppState};

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(
            state
                .config
                .allowed_origin
                .parse::<header::HeaderValue>()
                .expect("invalid ALLOWED_ORIGIN"),
        )
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    let mut router = Router::new()
        .route("/health", get(handlers::health::health_check))
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
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
}
