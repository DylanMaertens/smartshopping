use axum::Json;
use serde::{Deserialize, Serialize};

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

pub async fn sync_list(Json(req): Json<SyncRequest>) -> Json<SyncResponse> {
    Json(SyncResponse {
        list_id: req.list_id,
        server_time: req.last_sync,
        conflicts: Vec::new(),
    })
}
