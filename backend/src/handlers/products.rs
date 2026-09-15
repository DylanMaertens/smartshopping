use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    error::ApiError,
    models::product::ProductResponse,
    services::categories,
    state::{AppState, MetricKind},
};

pub async fn get_product(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Result<Json<ProductResponse>, ApiError> {
    if !is_valid_barcode(&barcode) {
        return Err(ApiError::bad_request("Invalid barcode format"));
    }

    if let Some(found) = state.products_cache.get(&barcode).await {
        state.record_metric(MetricKind::ProductCacheHit);
        return Ok(Json(found));
    }
    if let Some(redis_cache) = &state.redis_cache {
        if let Some(mut found) = redis_cache.get_product(&barcode).await {
            found.cached = true;
            found.source = "redis-cache".to_string();
            state.record_metric(MetricKind::ProductCacheHit);
            state
                .products_cache
                .insert(barcode.clone(), found.clone())
                .await;
            return Ok(Json(found));
        }
    }
    state.record_metric(MetricKind::ProductCacheMiss);

    if state.config.enable_off_proxy {
        match state.off_client.get_product(&barcode).await {
            Ok(Some(remote)) => {
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

                state.record_metric(MetricKind::OffLookupSuccess);
                state
                    .products_cache
                    .insert(barcode.clone(), remote_response.clone())
                    .await;
                if let Some(redis_cache) = &state.redis_cache {
                    redis_cache
                        .set_product(&barcode, &remote_response, state.config.cache_ttl_seconds)
                        .await;
                }
                return Ok(Json(remote_response));
            }
            Ok(None) => {
                state.record_metric(MetricKind::OffLookupFailure);
                return Err(ApiError::not_found("Product not found for barcode"));
            }
            Err(error) => {
                state.record_metric(MetricKind::OffLookupFailure);
                tracing::warn!(%barcode, error = %error, "Open Food Facts lookup failed; using local placeholder");
            }
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
    if let Some(redis_cache) = &state.redis_cache {
        redis_cache
            .set_product(&barcode, &seeded, state.config.cache_ttl_seconds)
            .await;
    }
    Ok(Json(seeded))
}

fn is_valid_barcode(barcode: &str) -> bool {
    let len_ok = (8..=14).contains(&barcode.len());
    let digit_only = barcode.chars().all(|c| c.is_ascii_digit());
    len_ok && digit_only
}
