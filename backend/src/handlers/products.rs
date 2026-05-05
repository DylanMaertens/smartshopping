use axum::{extract::{Path, State}, Json};

use crate::{models::product::ProductResponse, state::AppState};

pub async fn get_product(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Json<ProductResponse> {
    if let Some(found) = state.products_cache.read().await.get(&barcode).cloned() {
        return Json(found);
    }

    let seeded = ProductResponse {
        barcode,
        product_name: "Produit à enrichir".to_string(),
        categories: vec!["non-categorise".to_string()],
        image_url: None,
        cached: true,
        stale: false,
        source: "local-seed".to_string(),
        ttl_seconds: state.config.cache_ttl_seconds,
    };

    state.products_cache.write().await.insert(barcode.clone(), seeded.clone());
    Json(seeded)
}
