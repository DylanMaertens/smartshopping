use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{header::HeaderName, HeaderValue},
    middleware::Next,
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::time::Instant;
use uuid::Uuid;

use crate::state::AppState;
use crate::state::MetricKind;

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

pub async fn request_id(request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(|value| HeaderValue::from_str(&value.to_string()).expect("uuid is a valid header"))
        .unwrap_or_else(|| {
            HeaderValue::from_str(&Uuid::new_v4().to_string()).expect("uuid is a valid header")
        });

    let mut response = next.run(request).await;
    response.headers_mut().insert(REQUEST_ID_HEADER, request_id);
    response
}

pub async fn request_metrics(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let endpoint = normalized_endpoint(request.uri().path());
    let started_at = Instant::now();
    let response = next.run(request).await;
    state
        .metrics
        .record_http_request(endpoint, started_at.elapsed());
    response
}

pub async fn api_rate_limit(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    if matches!(request.uri().path(), "/health" | "/metrics") {
        return next.run(request).await;
    }
    let client = request
        .headers()
        .get("x-device-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| "anonymous".to_string());
    if !state.allow_api_request(&client).await {
        state.record_metric(MetricKind::ApiRateLimitRejection);
        return (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            [(axum::http::header::RETRY_AFTER, "60")],
            "rate limit exceeded",
        )
            .into_response();
    }
    next.run(request).await
}

pub async fn device_signature(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    if !state.config.require_device_signatures
        || matches!(
            path.as_str(),
            "/health" | "/metrics" | "/api/v1/devices/register"
        )
    {
        return next.run(request).await;
    }
    let unauthorized = || {
        (
            axum::http::StatusCode::UNAUTHORIZED,
            "invalid device signature",
        )
            .into_response()
    };
    let headers = request.headers();
    let Some(device_id) = headers
        .get("x-device-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
    else {
        return unauthorized();
    };
    let Some(request_id) = headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
    else {
        return unauthorized();
    };
    let Some(timestamp) = headers
        .get("x-device-timestamp")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
    else {
        return unauthorized();
    };
    let Some(signature) = headers
        .get("x-device-signature")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
    else {
        return unauthorized();
    };
    let Ok(device_id) = Uuid::parse_str(&device_id).map(|value| value.to_string()) else {
        return unauthorized();
    };
    if Uuid::parse_str(&request_id).is_err()
        || (chrono::Utc::now().timestamp_millis() - timestamp).abs() > 5 * 60 * 1_000
    {
        return unauthorized();
    }
    let Ok(Some(secret)) = state.device_secret(&device_id).await else {
        return unauthorized();
    };
    let body = std::mem::replace(request.body_mut(), Body::empty());
    let Ok(bytes) = to_bytes(body, 64 * 1024).await else {
        return (
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            "request body too large",
        )
            .into_response();
    };
    let body_hash = hex::encode(Sha256::digest(&bytes));
    let target = request
        .uri()
        .path_and_query()
        .map_or(path.as_str(), |value| value.as_str());
    let message = format!(
        "{timestamp}\n{request_id}\n{}\n{target}\n{body_hash}",
        request.method()
    );
    let Ok(signature) = hex::decode(signature) else {
        return unauthorized();
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return unauthorized();
    };
    mac.update(message.as_bytes());
    if mac.verify_slice(&signature).is_err() {
        return unauthorized();
    }
    match state.claim_signed_request(&request_id).await {
        Ok(true) => {}
        Ok(false) => return unauthorized(),
        Err(error) => {
            tracing::error!(%error, "anti-replay store unavailable");
            return unauthorized();
        }
    }
    *request.body_mut() = Body::from(bytes);
    next.run(request).await
}

fn normalized_endpoint(path: &str) -> &'static str {
    if path.starts_with("/api/v1/products/") {
        "/api/v1/products/:barcode"
    } else if path.starts_with("/api/v1/lists/") && path.ends_with("/invitations") {
        "/api/v1/lists/:list_id/invitations"
    } else if path.starts_with("/api/v1/lists/") && path.ends_with("/members") {
        "/api/v1/lists/:list_id/members"
    } else if path.starts_with("/api/v1/lists/") && path.ends_with("/revoke") {
        "/api/v1/lists/:list_id/members/:member_id/revoke"
    } else if path.starts_with("/api/v1/invitations/") && path.ends_with("/join") {
        "/api/v1/invitations/:code/join"
    } else if path.starts_with("/api/v1/invitations/") && path.ends_with("/revoke") {
        "/api/v1/invitations/:code/revoke"
    } else {
        match path {
            "/health" => "/health",
            "/metrics" => "/metrics",
            "/api/v1/categories" => "/api/v1/categories",
            "/api/v1/categories/classify" => "/api/v1/categories/classify",
            "/api/v1/sync" => "/api/v1/sync",
            "/api/v1/devices/register" => "/api/v1/devices/register",
            "/api/v1/devices/rotate-secret" => "/api/v1/devices/rotate-secret",
            _ => "/other",
        }
    }
}
