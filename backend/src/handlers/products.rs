use axum::{extract::{Path, State}, Json};

use crate::{error::ApiError, models::product::ProductResponse, state::AppState};

pub async fn get_product(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Result<Json<ProductResponse>, ApiError> {
    if !is_valid_barcode(&barcode) {
        return Err(ApiError::bad_request("Invalid barcode format"));
    }

    if let Some(found) = state.products_cache.read().await.get(&barcode).cloned() {
        return Ok(Json(found));
    }

    let seeded = ProductResponse {
        barcode: barcode.clone(),
        product_name: "Produit à enrichir".to_string(),
        categories: vec!["non-categorise".to_string()],
        image_url: None,
        cached: true,
        stale: false,
        source: "local-seed".to_string(),
        ttl_seconds: state.config.cache_ttl_seconds,
    };

    state
        .products_cache
        .write()
        .await
        .insert(barcode.clone(), seeded.clone());
    Ok(Json(seeded))
}

fn is_valid_barcode(barcode: &str) -> bool {
    let len_ok = (8..=14).contains(&barcode.len());
    let digit_only = barcode.chars().all(|c| c.is_ascii_digit());
    len_ok && digit_only
}
