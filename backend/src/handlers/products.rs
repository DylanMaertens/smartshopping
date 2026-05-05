use axum::{extract::{Path, State}, Json};

use crate::{config::Config, models::product::ProductResponse};

pub async fn get_product(
    State(config): State<Config>,
    Path(barcode): Path<String>,
) -> Json<ProductResponse> {
    Json(ProductResponse {
        barcode,
        product_name: "Produit à enrichir".to_string(),
        categories: vec!["non-categorise".to_string()],
        image_url: None,
        cached: true,
        stale: false,
        source: "local-seed".to_string(),
        ttl_seconds: config.cache_ttl_seconds,
    })
}
