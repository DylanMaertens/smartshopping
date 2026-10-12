use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderValue, Method},
    middleware::{from_fn, from_fn_with_state},
    routing::{get, post},
    Router,
};
use tower_http::{
    compression::CompressionLayer, cors::CorsLayer, set_header::SetResponseHeaderLayer,
};

use crate::{handlers, middleware, state::AppState};

const DEVICE_ID_HEADER: &str = "x-device-id";
const REQUEST_ID_HEADER: &str = "x-request-id";
const DEVICE_SIGNATURE_HEADER: &str = "x-device-signature";
const DEVICE_TIMESTAMP_HEADER: &str = "x-device-timestamp";

pub fn create_router(state: AppState) -> Router {
    let admin_router = handlers::admin::router(state.clone());
    let contact_router = handlers::contact::router(state.clone());
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
        .route(
            "/api/v1/ocr",
            post(handlers::ocr::recognize).layer(DefaultBodyLimit::max(handlers::ocr::BODY_LIMIT)),
        )
        .route("/health", get(handlers::health::health_check))
        .route("/metrics", get(handlers::metrics::metrics))
        .route(
            "/api/v1/devices/register",
            post(handlers::device_auth::enroll),
        )
        .route(
            "/api/v1/devices/rotate-secret",
            post(handlers::device_auth::rotate),
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
                "/api/v1/lists/:list_id/delete",
                post(handlers::sharing::delete_list),
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

    if state.config.enable_community_catalog && state.db_pool.is_some() {
        router = router.route(
            "/api/v1/community/products/:barcode/validated",
            get(handlers::community::get_validated_fields),
        );
        router = router.route(
            "/api/v1/community/products/:barcode/suggestions",
            get(handlers::community::get_suggestions),
        );
        // Never expose community writes when the global signature protection is disabled.
        if state.config.require_device_signatures {
            router = router
                .route(
                    "/api/v1/community/products/:barcode/proposals",
                    post(handlers::community::propose),
                )
                .route(
                    "/api/v1/community/proposals/:proposal_id/confirmations",
                    post(handlers::community::confirm),
                )
                .route(
                    "/api/v1/community/proposals/:proposal_id/reports",
                    post(handlers::community::report),
                );
        }
    }

    let api_router = router
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
        .layer(from_fn_with_state(
            signature_state,
            middleware::device_signature,
        ))
        .layer(from_fn_with_state(
            rate_limit_state,
            middleware::api_rate_limit,
        ));
    // Admin has its own cookie/CSRF protections, never device signatures or app CORS.
    // Merge API last to preserve its signature/body limits on unmatched API routes.
    admin_router.merge(contact_router).merge(api_router)
        // Outermost diagnostics also observe signature and rate-limit rejections.
        // No raw URI/header tracing: invitation codes and query strings stay private.
        .layer(from_fn_with_state(metrics_state, middleware::request_metrics))
        .layer(from_fn(middleware::request_id))
}
