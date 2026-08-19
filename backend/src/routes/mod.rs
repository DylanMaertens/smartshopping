use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderValue, Method},
    middleware::{from_fn, from_fn_with_state},
    routing::{get, post},
    Router,
};
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};

use crate::{handlers, middleware, state::AppState};

const DEVICE_ID_HEADER: &str = "x-device-id";
const REQUEST_ID_HEADER: &str = "x-request-id";
const DEVICE_SIGNATURE_HEADER: &str = "x-device-signature";
const DEVICE_TIMESTAMP_HEADER: &str = "x-device-timestamp";

pub fn create_router(state: AppState) -> Router {
    let metrics_state = state.clone();
    let rate_limit_state = state.clone();
    let signature_state = state.clone();
    let allowed_origin = state
        .config
        .allowed_origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:8081"));

    let cors = CorsLayer::new()
        .allow_origin(allowed_origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            header::CONTENT_TYPE,
            header::HeaderName::from_static(DEVICE_ID_HEADER),
            header::HeaderName::from_static(REQUEST_ID_HEADER),
            header::HeaderName::from_static(DEVICE_SIGNATURE_HEADER),
            header::HeaderName::from_static(DEVICE_TIMESTAMP_HEADER),
        ])
        .expose_headers([header::HeaderName::from_static(REQUEST_ID_HEADER)]);

    let mut router = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/metrics", get(handlers::metrics::metrics))
        .route(
            "/api/v1/devices/register",
            post(handlers::device_auth::enroll),
        )
        .route(
            "/api/v1/products/:barcode",
            get(handlers::products::get_product),
        )
        .route(
            "/api/v1/categories",
            get(handlers::categories::get_categories),
        )
        .route(
            "/api/v1/categories/classify",
            post(handlers::categories::classify_product),
        );

    if state.config.enable_sync_endpoint {
        router = router
            .route("/api/v1/sync", post(handlers::sync::sync_list))
            .route(
                "/api/v1/lists/:list_id/invitations",
                post(handlers::sharing::create_invitation),
            )
            .route(
                "/api/v1/lists/:list_id/members",
                get(handlers::sharing::list_members),
            )
            .route(
                "/api/v1/lists/:list_id/members/:member_id/revoke",
                post(handlers::sharing::remove_member),
            )
            .route(
                "/api/v1/invitations/:code/join",
                post(handlers::sharing::join_invitation),
            )
            .route(
                "/api/v1/invitations/:code/revoke",
                post(handlers::sharing::revoke_invitation),
            );
    }

    router
        .with_state(state)
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(cors)
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(from_fn_with_state(
            metrics_state,
            middleware::request_metrics,
        ))
        .layer(from_fn_with_state(
            signature_state,
            middleware::device_signature,
        ))
        .layer(from_fn_with_state(
            rate_limit_state,
            middleware::api_rate_limit,
        ))
        .layer(from_fn(middleware::request_id))
}
