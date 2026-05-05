use axum::{routing::{get, post}, Router};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};

use crate::{config::Config, handlers};

pub fn create_router(config: Config) -> Router {
    Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/api/v1/products/:barcode", get(handlers::products::get_product))
        .route("/api/v1/categories", get(handlers::categories::get_categories))
        .route("/api/v1/categories/classify", post(handlers::categories::classify_product))
        .route("/api/v1/sync", post(handlers::sync::sync_list))
        .with_state(config)
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
}
