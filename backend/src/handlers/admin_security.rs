use crate::{
    services::access_security::{self, AccessEvent, Block, Decision},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use uuid::Uuid;
#[derive(serde::Serialize, sqlx::FromRow)]
struct History {
    device_id: String,
    actor: String,
    expires_at: Option<i64>,
    reason: String,
    created_at: i64,
}

fn unavailable() -> Response {
    super::admin::failure(StatusCode::SERVICE_UNAVAILABLE, "SECURITY_UNAVAILABLE")
}
pub async fn snapshot(State(state): State<AppState>) -> Response {
    let Some(pool) = &state.db_pool else {
        return unavailable();
    };
    let result = async {
        let now = chrono::Utc::now().timestamp_millis();
        let events = sqlx::query_as::<_, AccessEvent>("SELECT created_at,device_id,reference,route,method,service,status,code FROM access_events WHERE created_at >= $1 ORDER BY id DESC LIMIT 200")
            .bind(now - 7 * 24 * 60 * 60 * 1000).fetch_all(pool).await?;
        let blocks = sqlx::query_as::<_, Block>("SELECT * FROM device_access_blocks WHERE expires_at > $1 ORDER BY updated_at DESC LIMIT 1000")
            .bind(now).fetch_all(pool).await?;
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM device_access_blocks WHERE expires_at > $1")
                .bind(now)
                .fetch_one(pool)
                .await?;
        let history = sqlx::query_as::<_, History>("SELECT device_id,actor,expires_at,reason,created_at FROM security_decisions ORDER BY id DESC LIMIT 50").fetch_all(pool).await?;
        Ok::<_, sqlx::Error>(
            json!({"events":events,"blocks":blocks,"block_count":count,"history":history,
            "dropped_since_start":state.access_journal.dropped(), "enforced":state.config.require_device_signatures}),
        )
    };
    match tokio::time::timeout(std::time::Duration::from_secs(5), result).await {
        Ok(Ok(data)) => Json(data).into_response(),
        _ => unavailable(),
    }
}
pub async fn device(State(state): State<AppState>, Path(device): Path<Uuid>) -> Response {
    let Some(pool) = &state.db_pool else {
        return unavailable();
    };
    match sqlx::query_as::<_, Block>("SELECT * FROM device_access_blocks WHERE device_id=$1")
        .bind(device.to_string())
        .fetch_optional(pool)
        .await
    {
        Ok(block) => Json(json!({"block":block})).into_response(),
        _ => unavailable(),
    }
}
pub async fn decide(State(state): State<AppState>, Json(decision): Json<Decision>) -> Response {
    if !decision.valid() {
        return super::admin::failure(StatusCode::BAD_REQUEST, "BAD_REQUEST");
    }
    if !state.config.require_device_signatures {
        return unavailable();
    }
    let (Some(pool), Some(actor)) = (&state.db_pool, state.admin.operator()) else {
        return unavailable();
    };
    match access_security::decide(pool, &decision, actor).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => super::admin::failure(StatusCode::CONFLICT, "SECURITY_STALE"),
        Err(sqlx::Error::RowNotFound) => {
            super::admin::failure(StatusCode::NOT_FOUND, "SECURITY_UNKNOWN_DEVICE")
        }
        Err(_) => unavailable(),
    }
}
