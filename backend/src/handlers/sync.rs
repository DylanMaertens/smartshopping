use axum::{extract::State, http::HeaderMap, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::ApiError,
    services::persistent_sync,
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
    pub device_id: String,
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
    let device_id = validate_device_id(&headers)?;
    if req.last_sync < 0 {
        return Err(ApiError::bad_request("last_sync cannot be negative"));
    }
    validate_list_id(&req.list_id)?;
    let now = Utc::now().timestamp_millis();
    for item in &req.items {
        validate_sync_item(item, now)?;
        if item.list_id != req.list_id {
            return Err(ApiError::bad_request(
                "item list_id must match request list_id",
            ));
        }
    }

    state
        .device_registry
        .lock()
        .await
        .register_sync(&device_id)
        .map_err(|_| ApiError::internal_server_error("failed to persist device profile"))?;

    let authorized = state
        .sharing
        .authorize_or_claim(state.db_pool.as_ref(), &req.list_id, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to verify list access");
            ApiError::internal_server_error("failed to verify list access")
        })?;
    if !authorized {
        return Err(ApiError::forbidden("device is not a member of this list"));
    }

    let mut remote_items = match state.synced_items.get(&req.list_id).await {
        Some(items) => items,
        None => match &state.db_pool {
            Some(pool) => persistent_sync::load_sync_items(pool, &req.list_id)
                .await
                .map_err(|error| {
                    tracing::error!(%error, "failed to load persisted shopping list");
                    ApiError::internal_server_error("failed to load persisted shopping list")
                })?,
            None => Vec::new(),
        },
    };
    let mut conflicts = Vec::new();

    for incoming in req.items {
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

    remote_items.sort_by_key(|item| item.updated_at);
    let updated_items = remote_items
        .iter()
        .filter(|item| item.updated_at > req.last_sync)
        .cloned()
        .collect::<Vec<_>>();

    if let Some(pool) = &state.db_pool {
        persistent_sync::persist_sync_items(pool, &device_id, &req.list_id, &remote_items)
            .await
            .map_err(|error| {
                tracing::error!(%error, "failed to persist synced shopping list");
                ApiError::internal_server_error("failed to persist synced shopping list")
            })?;
    }

    state
        .synced_items
        .insert(req.list_id.clone(), remote_items)
        .await;

    state.record_metric(MetricKind::SyncSuccess);

    Ok(Json(SyncResponse {
        list_id: req.list_id,
        device_id,
        server_time: now,
        conflicts,
        updated_items,
    }))
}

fn validate_sync_item(item: &SyncItem, server_time: i64) -> Result<(), ApiError> {
    validate_entity_id(&item.id, "item id")?;
    validate_list_id(&item.list_id)?;
    if item.name.trim().is_empty() || item.name.len() > 200 {
        return Err(ApiError::bad_request(
            "item name must contain 1 to 200 bytes",
        ));
    }
    if !(1..=999).contains(&item.quantity) {
        return Err(ApiError::bad_request(
            "item quantity must be between 1 and 999",
        ));
    }
    if item.updated_at < 0 || item.updated_at > server_time.saturating_add(5 * 60 * 1_000) {
        return Err(ApiError::bad_request(
            "item updated_at is outside the accepted time window",
        ));
    }
    if item.barcode.as_ref().is_some_and(|barcode| {
        !(8..=14).contains(&barcode.len()) || !barcode.bytes().all(|byte| byte.is_ascii_digit())
    }) {
        return Err(ApiError::bad_request(
            "item barcode must contain 8 to 14 digits",
        ));
    }
    if item
        .category
        .as_ref()
        .is_some_and(|category| category.len() > 100)
    {
        return Err(ApiError::bad_request(
            "item category cannot exceed 100 bytes",
        ));
    }
    Ok(())
}

fn validate_entity_id(value: &str, field: &str) -> Result<(), ApiError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(ApiError::bad_request(format!(
            "{field} must contain 1 to 128 ASCII letters, digits, hyphens or underscores"
        )));
    }
    Ok(())
}

pub(crate) fn validate_device_id(headers: &HeaderMap) -> Result<String, ApiError> {
    let Some(device_id) = headers.get("x-device-id") else {
        return Err(ApiError::bad_request("Missing X-Device-Id header"));
    };

    let device_id = device_id
        .to_str()
        .map_err(|_| ApiError::bad_request("Invalid X-Device-Id header"))?;

    Uuid::parse_str(device_id)
        .map_err(|_| ApiError::bad_request("X-Device-Id must be a valid UUID"))?;

    Ok(device_id.to_string())
}

pub(crate) fn validate_list_id(list_id: &str) -> Result<(), ApiError> {
    if list_id.is_empty()
        || list_id.len() > 128
        || !list_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(ApiError::bad_request(
            "list_id must contain 1 to 128 ASCII letters, digits, hyphens or underscores",
        ));
    }
    Ok(())
}
