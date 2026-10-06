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

    if let Some(mut found) = state.products_cache.get(&barcode).await {
        if cache_usable(&state, &found).await {
            found.cached = true;
            state.record_metric(MetricKind::ProductCacheHit);
            return Ok(Json(found));
        }
    }
    if let Some(redis_cache) = &state.redis_cache {
        if let Some(mut found) = redis_cache.get_product(&barcode).await {
            if cache_usable(&state, &found).await {
                found.cached = true;
                // Preserve which catalogue supplied this cached product.
                state.record_metric(MetricKind::ProductCacheHit);
                state
                    .products_cache
                    .insert(barcode.clone(), found.clone())
                    .await;
                return Ok(Json(found));
            }
        }
    }
    state.record_metric(MetricKind::ProductCacheMiss);

    let mut unavailable = false;
    if state.config.enable_off_proxy {
        for (source, client) in &state.product_clients {
            // Includes retries and rate-limit waiting; four sources stay within 16 seconds.
            let lookup = tokio::time::timeout(
                std::time::Duration::from_secs(4),
                client.get_product(&barcode),
            )
            .await;
            match lookup {
                Ok(Ok(Some(remote))) => {
                    let category_match = categories::classify_catalogue_product(
                        &remote.name,
                        &remote.categories,
                        source,
                    );
                    let product = ProductResponse {
                        barcode: barcode.clone(),
                        product_name: remote.name,
                        categories: vec![category_match.category_name],
                        image_url: remote.image_url,
                        cached: false,
                        stale: false,
                        source: (*source).to_string(),
                        ttl_seconds: state.config.cache_ttl_seconds,
                    };
                    state.record_metric(MetricKind::OffLookupSuccess);
                    state
                        .products_cache
                        .insert(barcode.clone(), product.clone())
                        .await;
                    if let Some(cache) = &state.redis_cache {
                        cache
                            .set_product(&barcode, &product, state.config.cache_ttl_seconds)
                            .await;
                    }
                    return Ok(Json(product));
                }
                Ok(Ok(None)) => {} // Absent or unnamed: try the next catalogue.
                _ => {
                    unavailable = true;
                    tracing::warn!(%barcode, source, "Product catalogue unavailable; trying next source");
                }
            }
        }
        state.record_metric(MetricKind::OffLookupFailure);
    }

    if state.config.enable_community_catalog {
        if let Some(pool) = &state.db_pool {
            match crate::services::community_catalog::validated_product(
                pool,
                &barcode,
                &state.config,
            )
            .await
            {
                Ok(Some(remote)) => {
                    let product = ProductResponse {
                        barcode: barcode.clone(),
                        product_name: remote.name,
                        categories: remote.category.into_iter().collect(),
                        image_url: None,
                        cached: false,
                        stale: false,
                        source: "community".into(),
                        ttl_seconds: state.config.cache_ttl_seconds,
                    };
                    state
                        .products_cache
                        .insert(barcode.clone(), product.clone())
                        .await;
                    if let Some(cache) = &state.redis_cache {
                        cache
                            .set_product(&barcode, &product, state.config.cache_ttl_seconds)
                            .await;
                    }
                    return Ok(Json(product));
                }
                Ok(None) => {}
                Err(error) => {
                    unavailable = true;
                    tracing::warn!(%error, %barcode, "Community catalog unavailable");
                }
            }
        } else {
            unavailable = true;
        }
    }
    // Never cache a placeholder after an outage or a miss.
    if unavailable {
        Err(ApiError {
            status: axum::http::StatusCode::SERVICE_UNAVAILABLE,
            code: "PRODUCT_LOOKUP_UNAVAILABLE",
            message: "Some product catalogues are temporarily unavailable".into(),
        })
    } else {
        Err(ApiError::not_found("Product not found in any catalogue"))
    }
}

fn is_valid_barcode(barcode: &str) -> bool {
    let len_ok = (8..=14).contains(&barcode.len());
    let digit_only = barcode.chars().all(|c| c.is_ascii_digit());
    len_ok && digit_only
}

async fn cache_usable(state: &AppState, product: &ProductResponse) -> bool {
    if product.source != "community" {
        return true;
    }
    if !state.config.enable_community_catalog {
        return false;
    }
    let Some(pool) = &state.db_pool else {
        return false;
    };
    match crate::services::community_catalog::validated_product(
        pool,
        &product.barcode,
        &state.config,
    )
    .await
    {
        Ok(Some(current)) => {
            current.name == product.product_name
                && current.category.into_iter().collect::<Vec<_>>() == product.categories
        }
        _ => false,
    }
}
