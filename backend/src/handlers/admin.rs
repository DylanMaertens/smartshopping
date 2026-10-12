use crate::{
    middleware::DiagnosticCode,
    services::admin::{ABSOLUTE_TTL, COOKIE},
    state::AppState,
};
use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    middleware::{from_fn_with_state, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/admin/api/login", post(login))
        .route("/admin/api/session", get(session))
        .route("/admin/api/logout", post(logout))
        .route("/admin/api/overview", get(overview))
        .route("/admin/api/logs", get(logs))
        .route(
            "/admin/api/queue-counts",
            get(super::admin_workflows::counts),
        )
        .route(
            "/admin/api/queues/:kind",
            get(super::admin_workflows::queue),
        )
        .route(
            "/admin/api/queues/:kind/:id",
            get(super::admin_workflows::detail),
        )
        .route(
            "/admin/api/queues/:kind/:id/decision",
            post(super::admin_workflows::decide),
        )
        .layer(DefaultBodyLimit::max(8192))
        .route_layer(from_fn_with_state(state.clone(), protect));
    Router::new()
        .merge(api)
        .route("/admin", get(page))
        .route("/admin/", get(page))
        .route("/admin/index.html", get(page))
        .route("/admin/live.html", get(page))
        .route("/admin/live.js", get(script))
        .route("/admin/workflows.js", get(workflow_script))
        .route("/admin/live.css", get(styles))
        .with_state(state)
        .route_layer(axum::middleware::from_fn(security_headers))
}

// No third-party origins, inline scripts, framing, or browser caching of admin data.
pub(crate) async fn security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"));
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    response
}
async fn page() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        include_str!("../../admin/live.html")
            .replace("data-backend=\"false\"", "data-backend=\"true\""),
    )
}
async fn script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../admin/live.js"),
    )
}
async fn workflow_script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../admin/workflows.js"),
    )
}
async fn styles() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../../admin/live.css"),
    )
}

fn failure(status: StatusCode, code: &'static str) -> Response {
    let mut response = (status, Json(json!({"code": code}))).into_response();
    response.extensions_mut().insert(DiagnosticCode(code));
    response
}
fn token(headers: &HeaderMap) -> Option<&str> {
    let mut found = None;
    for header in headers.get_all(header::COOKIE) {
        for part in header.to_str().ok()?.split(';') {
            let Some((key, value)) = part.trim().split_once('=') else {
                continue;
            };
            if key == COOKIE {
                if found.is_some() {
                    return None;
                }
                found = Some(value);
            }
        }
    }
    found
}
fn header_is(headers: &HeaderMap, name: &str, expected: &str) -> bool {
    headers.get(name).and_then(|v| v.to_str().ok()) == Some(expected)
}

async fn protect(State(state): State<AppState>, mut request: Request, next: Next) -> Response {
    // This first deployment trusts only the same-host HTTPS tunnel/reverse proxy.
    // Never accept forwarding headers as proof of TLS or peer identity.
    let local_peer = request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .is_some_and(|peer| peer.0.ip().is_loopback());
    if !local_peer {
        return failure(StatusCode::FORBIDDEN, "ADMIN_PROXY_REJECTED");
    }
    let Some(origin) = state.admin.trusted_origin() else {
        return failure(StatusCode::SERVICE_UNAVAILABLE, "ADMIN_NOT_CONFIGURED");
    };
    // Do not derive trust from Host, X-Forwarded-Host or an arbitrary browser URL.
    let authority = origin.strip_prefix("https://").unwrap();
    let headers = request.headers();
    if !header_is(headers, "host", authority)
        || !header_is(headers, "x-poduna-admin", "1")
        || headers
            .get("sec-fetch-site")
            .is_some_and(|v| v != "same-origin" && v != "none")
        || headers.contains_key(header::ORIGIN) && !header_is(headers, "origin", &origin)
    {
        return failure(StatusCode::FORBIDDEN, "ADMIN_ORIGIN_REJECTED");
    }
    if request.method() == axum::http::Method::POST && !header_is(headers, "origin", &origin) {
        return failure(StatusCode::FORBIDDEN, "ADMIN_ORIGIN_REJECTED");
    }
    if request.uri().path() != "/admin/api/login" {
        let Some(csrf) = token(headers).and_then(|token| state.admin.session(token, &origin))
        else {
            return failure(StatusCode::UNAUTHORIZED, "ADMIN_SESSION_EXPIRED");
        };
        if request.method() != axum::http::Method::GET && !header_is(headers, "x-csrf-token", &csrf)
        {
            return failure(StatusCode::FORBIDDEN, "ADMIN_CSRF_REJECTED");
        }
        request.extensions_mut().insert(AdminSession { csrf });
    } else if !state.admin.allow_login() {
        let mut response = failure(StatusCode::TOO_MANY_REQUESTS, "ADMIN_LOGIN_THROTTLED");
        response
            .headers_mut()
            .insert(header::RETRY_AFTER, HeaderValue::from_static("300"));
        return response;
    }
    next.run(request).await
}
#[derive(Clone)]
struct AdminSession {
    csrf: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    username: String,
    password: String,
}
async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Login>,
) -> Response {
    if payload.username.len() > 80 || payload.password.len() > 1024 {
        return failure(StatusCode::UNAUTHORIZED, "ADMIN_LOGIN_FAILED");
    }
    let admin = state.admin.clone();
    let ok = tokio::task::spawn_blocking(move || {
        admin.verify_password(&payload.username, &payload.password)
    })
    .await
    .unwrap_or(false);
    if !ok {
        return failure(StatusCode::UNAUTHORIZED, "ADMIN_LOGIN_FAILED");
    }
    // Recheck in case the temporary tunnel origin changed during password hashing.
    let Some(origin) = state
        .admin
        .trusted_origin()
        .filter(|origin| header_is(&headers, "origin", origin))
    else {
        return failure(StatusCode::FORBIDDEN, "ADMIN_ORIGIN_REJECTED");
    };
    let (token, csrf) = state.admin.create_session(origin, token(&headers));
    let mut response =
        Json(json!({"csrf": csrf, "idle_seconds": 1800, "absolute_seconds": ABSOLUTE_TTL}))
            .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{COOKIE}={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={ABSOLUTE_TTL}"
        ))
        .unwrap(),
    );
    response
        .extensions_mut()
        .insert(DiagnosticCode("ADMIN_LOGIN_OK"));
    response
}
async fn session(axum::Extension(session): axum::Extension<AdminSession>) -> impl IntoResponse {
    Json(json!({"csrf": session.csrf, "idle_seconds": 1800, "absolute_seconds": ABSOLUTE_TTL}))
}
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(token) = token(&headers) {
        state.admin.revoke(token);
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "__Host-poduna_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
        ),
    );
    response
        .extensions_mut()
        .insert(DiagnosticCode("ADMIN_LOGOUT"));
    response
}
async fn logs(State(state): State<AppState>) -> impl IntoResponse {
    Json(
        json!({"events": state.admin.events(), "capacity": 1000, "retention_hours": 24, "storage": "memory"}),
    )
}
async fn overview(State(state): State<AppState>) -> impl IntoResponse {
    let postgres = async {
        match &state.db_pool {
            Some(pool) => match tokio::time::timeout(
                Duration::from_secs(1),
                sqlx::query("SELECT 1").execute(pool),
            )
            .await
            {
                Ok(Ok(_)) => "available",
                _ => "unavailable",
            },
            None if state.config.database_url.is_some() => "unavailable",
            None => "not_configured",
        }
    };
    let redis = async {
        match &state.redis_cache {
            Some(cache) => match tokio::time::timeout(Duration::from_secs(1), cache.ping()).await {
                Ok(Ok(())) => "available",
                _ => "unavailable",
            },
            None if state.config.redis_url.is_some() => "unavailable",
            None => "not_configured",
        }
    };
    let (postgres, redis) = tokio::join!(postgres, redis);
    Json(json!({
        "generated_at": chrono::Utc::now().to_rfc3339(), "traffic": state.admin.snapshot(),
        "services": { "api": "available", "postgres": postgres, "redis": redis,
            "catalogues": if state.config.enable_off_proxy { "enabled_not_probed" } else { "disabled" },
            "ocr": "on_demand_not_probed",
            "community": if state.config.enable_community_catalog && state.db_pool.is_some() { "enabled" } else { "disabled" },
            "sync": if state.config.enable_sync_endpoint { "enabled" } else { "disabled" } },
        "counters": state.metrics.admin_summary(),
        "scope": "single_process_since_restart"
    }))
}
