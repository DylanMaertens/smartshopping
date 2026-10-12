use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
};

use crate::state::AppState;

pub async fn metrics(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if state.config.metrics_token.as_ref().is_none_or(|token| token.is_empty()) {
        return (StatusCode::NOT_FOUND, [(header::CONTENT_TYPE, "text/plain")], "not found".to_string());
    }
    if let Some(expected) = &state.config.metrics_token {
        let authorized = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .is_some_and(|provided| constant_time_eq(provided.as_bytes(), expected.as_bytes()));
        if !authorized {
            return (
                StatusCode::UNAUTHORIZED,
                [(header::CONTENT_TYPE, "text/plain")],
                "unauthorized".to_string(),
            );
        }
    }
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        state.metrics.render_prometheus(),
    )
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}
