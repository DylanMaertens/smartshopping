use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Version;

use crate::{error::ApiError, state::AppState};

#[derive(Deserialize)]
pub struct EnrollRequest {
    pub device_id: String,
}

#[derive(Serialize)]
pub struct EnrollResponse {
    pub device_id: String,
    pub secret: String,
}

pub async fn enroll(
    State(state): State<AppState>,
    Json(request): Json<EnrollRequest>,
) -> Result<Json<EnrollResponse>, ApiError> {
    let id = uuid::Uuid::parse_str(&request.device_id)
        .map_err(|_| ApiError::bad_request("device_id must be a UUID v4"))?;
    if id.get_version() != Some(Version::Random) {
        return Err(ApiError::bad_request("device_id must be a UUID v4"));
    }
    let device_id = id.to_string();
    let secret = state
        .enroll_device(&device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to persist device credentials");
            ApiError::internal_server_error("failed to persist device credentials")
        })?
        .ok_or_else(|| ApiError::conflict("device is already enrolled"))?;
    Ok(Json(EnrollResponse { device_id, secret }))
}

pub async fn rotate(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<EnrollResponse>, ApiError> {
    let device_id = headers
        .get("x-device-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::bad_request("X-Device-Id is required"))?;
    let device_id = uuid::Uuid::parse_str(device_id)
        .map_err(|_| ApiError::bad_request("X-Device-Id must be a UUID"))?
        .to_string();
    let secret = state
        .rotate_device_secret(&device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to rotate device credentials");
            ApiError::internal_server_error("failed to rotate device credentials")
        })?
        .ok_or_else(|| ApiError::not_found("device is not enrolled"))?;
    Ok(Json(EnrollResponse { device_id, secret }))
}
