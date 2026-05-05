use axum::{http::HeaderMap, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::ApiError;

#[derive(Deserialize)]
pub struct SyncRequest {
    pub list_id: String,
    pub last_sync: i64,
}

#[derive(Serialize)]
pub struct SyncResponse {
    pub list_id: String,
    pub server_time: i64,
    pub conflicts: Vec<String>,
}

pub async fn sync_list(
    headers: HeaderMap,
    Json(req): Json<SyncRequest>,
) -> Result<Json<SyncResponse>, ApiError> {
    let Some(device_id) = headers.get("x-device-id") else {
        return Err(ApiError::bad_request("Missing X-Device-Id header"));
    };

    let device_id = device_id
        .to_str()
        .map_err(|_| ApiError::bad_request("Invalid X-Device-Id header"))?;

    Uuid::parse_str(device_id)
        .map_err(|_| ApiError::bad_request("X-Device-Id must be a valid UUID"))?;

    Ok(Json(SyncResponse {
        list_id: req.list_id,
        server_time: req.last_sync,
        conflicts: Vec::new(),
    }))
}
