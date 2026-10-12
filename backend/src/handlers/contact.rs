//! Explicitly enabled, same-origin public contact. No device registration required.
use super::admin_workflows::{database, unavailable};
use crate::{error::ApiError, state::AppState};
use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{header, StatusCode},
    middleware::{from_fn, from_fn_with_state, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/api/v1/contact", post(submit))
        .route("/api/v1/contact/status", get(status))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .route_layer(from_fn_with_state(state.clone(), protect));
    Router::new()
        .merge(api)
        .route("/contact.html", get(page))
        .route("/contact.js", get(script))
        .route(
            "/styles.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../public/styles.css"),
                )
            }),
        )
        .route(
            "/contact.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../public/contact.css"),
                )
            }),
        )
        .route(
            "/contact-live.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../admin/contact-live.css"),
                )
            }),
        )
        .route(
            "/aide.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../public/aide.css"),
                )
            }),
        )
        .route(
            "/aide-android.html",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                    include_str!("../../public/aide-android.html"),
                )
            }),
        )
        .route(
            "/assets/brand/logo.svg",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "image/svg+xml")],
                    include_str!("../../public/logo.svg"),
                )
            }),
        )
        .route(
            "/assets/brand/favicon.ico",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "image/x-icon")],
                    include_bytes!("../../public/favicon.ico").as_slice(),
                )
            }),
        )
        .with_state(state)
        .route_layer(from_fn(super::admin::security_headers))
}
async fn page() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        include_str!("../../admin/contact.html"),
    )
}
async fn script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../admin/contact.js"),
    )
}
fn error(status: StatusCode, code: &'static str) -> ApiError {
    ApiError {
        status,
        code,
        message: "Contact indisponible ou demande refusée".into(),
    }
}
async fn protect(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let Some(origin) = state
        .admin
        .trusted_origin()
        .filter(|_| state.contact_enabled && state.db_pool.is_some())
    else {
        return error(StatusCode::SERVICE_UNAVAILABLE, "CONTACT_DISABLED").into_response();
    };
    let h = request.headers();
    let matches =
        |name: &str, value: &str| h.get(name).and_then(|v| v.to_str().ok()) == Some(value);
    if !request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .is_some_and(|p| p.0.ip().is_loopback())
        || !matches("host", origin.strip_prefix("https://").unwrap())
        || !matches("x-poduna-contact", "1")
        || h.get("sec-fetch-site")
            .is_some_and(|v| v != "same-origin" && v != "none")
        || (h.contains_key("origin") || request.method() == axum::http::Method::POST)
            && !matches("origin", &origin)
    {
        return error(StatusCode::FORBIDDEN, "CONTACT_ORIGIN_REJECTED").into_response();
    }
    if request.method() == axum::http::Method::POST
        && !state.contact_rate_limiter.allow("contact-global")
    {
        return error(StatusCode::TOO_MANY_REQUESTS, "CONTACT_THROTTLED").into_response();
    }
    next.run(request).await
}
async fn status(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    sqlx::query("SELECT 1 FROM contact_messages LIMIT 0")
        .execute(database(&state)?)
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"available":true})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Submission {
    pub id: Uuid,
    pub email: String,
    pub topic: String,
    pub body: String,
    #[serde(default)]
    pub website: String,
}
pub async fn submit(
    State(state): State<AppState>,
    Json(input): Json<Submission>,
) -> Result<Json<Value>, ApiError> {
    let email = input.email.trim().to_lowercase();
    let body = input.body.trim();
    let email_parts: Vec<_> = email.split('@').collect();
    if input.id.is_nil()
        || !input.website.is_empty()
        || email.len() > 254
        || email_parts.len() != 2
        || email_parts[0].is_empty()
        || !email_parts[1].contains('.')
        || email_parts[1].starts_with('.')
        || email_parts[1].ends_with('.')
        || email
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "<>\"\\,;".contains(c))
        || !["question", "technical", "suggestion", "other"].contains(&input.topic.as_str())
        || !(20..=3000).contains(&body.chars().count())
        || body
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t' && c != '\r')
    {
        return Err(error(StatusCode::BAD_REQUEST, "CONTACT_INVALID"));
    }
    let mut tx = database(&state)?.begin().await.map_err(unavailable)?;
    sqlx::query("SET LOCAL lock_timeout = '3s'")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    sqlx::query("SET LOCAL statement_timeout = '5s'")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    // One lock makes idempotency and rolling quotas atomic across server processes.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('poduna-contact',0))")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    let existing: Option<bool> = sqlx::query_scalar(
        "SELECT email=$2 AND topic=$3 AND body=$4 FROM contact_messages WHERE id=$1",
    )
    .bind(input.id)
    .bind(&email)
    .bind(&input.topic)
    .bind(body)
    .fetch_optional(&mut *tx)
    .await
    .map_err(unavailable)?;
    if let Some(same) = existing {
        if !same {
            return Err(error(StatusCode::CONFLICT, "CONTACT_CONFLICT"));
        }
        return Ok(Json(json!({"received":true,"reference":input.id})));
    }
    let now = chrono::Utc::now().timestamp_millis();
    let (total,personal): (i64,i64) = sqlx::query_as("SELECT count(*),count(*) FILTER (WHERE email=$1) FROM contact_messages WHERE created_at > $2")
        .bind(&email).bind(now-3_600_000).fetch_one(&mut *tx).await.map_err(unavailable)?;
    if total >= 30 || personal >= 3 {
        return Err(error(StatusCode::TOO_MANY_REQUESTS, "CONTACT_THROTTLED"));
    }
    sqlx::query("INSERT INTO contact_messages(id,email,topic,body,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)")
        .bind(input.id).bind(email).bind(input.topic).bind(body).bind(now).execute(&mut *tx).await.map_err(unavailable)?;
    tx.commit().await.map_err(unavailable)?;
    Ok(Json(json!({"received":true,"reference":input.id})))
}
