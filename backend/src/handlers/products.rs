use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    error::ApiError, models::product::ProductResponse, services::categories, state::AppState,
};

pub async fn get_product(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Result<Json<ProductResponse>, ApiError> {
    if !is_valid_barcode(&barcode) {
        return Err(ApiError::bad_request("Invalid barcode format"));
    }

    if let Some(found) = state.products_cache.get(&barcode).await {
        return Ok(Json(found));
    }

    if state.config.enable_off_proxy {
        if let Ok(Some(remote)) = state.off_client.get_product(&barcode).await {
            let category_match = categories::classify_product(&remote.name, &remote.categories);
            let remote_response = ProductResponse {
                barcode: barcode.clone(),
                product_name: remote.name,
                categories: vec![category_match.category_name],
                image_url: remote.image_url,
                cached: false,
                stale: false,
                source: "openfoodfacts".to_string(),
                ttl_seconds: state.config.cache_ttl_seconds,
            };

            state
                .products_cache
                .insert(barcode.clone(), remote_response.clone())
                .await;
            return Ok(Json(remote_response));
        }
    }

    let seeded = ProductResponse {
        barcode: barcode.clone(),
        product_name: "Produit à enrichir".to_string(),
        categories: vec!["À classer".to_string()],
        image_url: None,
        cached: true,
        stale: false,
        source: "local-seed".to_string(),
        ttl_seconds: state.config.cache_ttl_seconds,
    };

    state
        .products_cache
        .insert(barcode.clone(), seeded.clone())
        .await;
    Ok(Json(seeded))
}

fn is_valid_barcode(barcode: &str) -> bool {
    let len_ok = (8..=14).contains(&barcode.len());
    let digit_only = barcode.chars().all(|c| c.is_ascii_digit());
    len_ok && digit_only
}
