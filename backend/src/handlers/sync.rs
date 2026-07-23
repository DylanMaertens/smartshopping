use axum::{extract::State, http::HeaderMap, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::ApiError,
    state::{AppState, MetricKind},
};

#[derive(Clone, Deserialize, Serialize)]
pub struct SyncItem {
    pub id: String,
    pub list_id: String,
    pub name: String,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub quantity: i32,
    pub checked: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Deserialize)]
pub struct SyncRequest {
    pub list_id: String,
    pub items: Vec<SyncItem>,
    pub last_sync: i64,
}

#[derive(Serialize)]
pub struct SyncConflict {
    pub entity_id: String,
    pub local_updated_at: i64,
    pub remote_updated_at: i64,
    pub resolution: &'static str,
}

#[derive(Serialize)]
pub struct SyncResponse {
    pub list_id: String,
    pub server_time: i64,
    pub conflicts: Vec<SyncConflict>,
    pub updated_items: Vec<SyncItem>,
}

pub async fn sync_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SyncRequest>,
) -> Result<Json<SyncResponse>, ApiError> {
    state.record_metric(MetricKind::SyncAttempt);
    validate_device_id(&headers)?;

    if req.list_id.trim().is_empty() {
        return Err(ApiError::bad_request("list_id is required"));
    }

    let now = Utc::now().timestamp_millis();
    let mut remote_items = state
        .synced_items
        .get(&req.list_id)
        .await
        .unwrap_or_default();
    let mut conflicts = Vec::new();

    for incoming in req.items {
        if incoming.list_id != req.list_id {
            return Err(ApiError::bad_request(
                "item list_id must match request list_id",
            ));
        }

        match remote_items.iter_mut().find(|item| item.id == incoming.id) {
            Some(remote) if incoming.updated_at >= remote.updated_at => *remote = incoming,
            Some(remote) => conflicts.push(SyncConflict {
                entity_id: incoming.id,
                local_updated_at: incoming.updated_at,
                remote_updated_at: remote.updated_at,
                resolution: "remote_wins_lww",
            }),
            None => remote_items.push(incoming),
        }
    }

    remote_items.sort_by(|left, right| left.updated_at.cmp(&right.updated_at));
    let updated_items = remote_items
        .iter()
        .filter(|item| item.updated_at > req.last_sync)
        .cloned()
        .collect::<Vec<_>>();

    state
        .synced_items
        .insert(req.list_id.clone(), remote_items)
        .await;

    state.record_metric(MetricKind::SyncSuccess);

    Ok(Json(SyncResponse {
        list_id: req.list_id,
        server_time: now,
        conflicts,
        updated_items,
    }))
}

fn validate_device_id(headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(device_id) = headers.get("x-device-id") else {
        return Err(ApiError::bad_request("Missing X-Device-Id header"));
    };

    let device_id = device_id
        .to_str()
        .map_err(|_| ApiError::bad_request("Invalid X-Device-Id header"))?;

    Uuid::parse_str(device_id)
        .map_err(|_| ApiError::bad_request("X-Device-Id must be a valid UUID"))?;

    Ok(())
}
