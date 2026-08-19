use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

use shopping_list_backend::{config::Config, routes::create_router, state::AppState};

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn rejects_invalid_barcode() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/products/abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn sync_endpoint_disabled_by_default() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sync")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn sync_requires_device_id_when_enabled() {
    let config = Config {
        host: "0.0.0.0".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        product_cache_capacity: 100,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
        off_base_url: "https://world.openfoodfacts.org/api/v2".into(),
        enable_off_proxy: false,
        off_rate_limit_per_minute: 100,
        off_max_retries: 0,
        device_registry_path: temp_registry_path("sync_requires_device_id"),
        redis_url: None,
        database_url: None,
        metrics_token: None,
        api_rate_limit_per_minute: 120,
        require_device_signatures: false,
    };

    let state = AppState::new(config);
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sync")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"list_id":"a","items":[],"last_sync":1}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn categories_endpoint_returns_store_aisles() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/categories")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn classify_product_uses_generic_store_aisles() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/categories/classify")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"product_name":"lait demi-écrémé"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn health_response_sets_security_headers() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-content-type-options").unwrap(),
        "nosniff",
    );
    assert_eq!(
        response.headers().get("referrer-policy").unwrap(),
        "no-referrer"
    );
}

#[tokio::test]
async fn sync_merges_items_and_returns_updates() {
    let config = Config {
        host: "0.0.0.0".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        product_cache_capacity: 100,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
        off_base_url: "https://world.openfoodfacts.org/api/v2".into(),
        enable_off_proxy: false,
        off_rate_limit_per_minute: 100,
        off_max_retries: 0,
        device_registry_path: temp_registry_path("sync_merges_items"),
        redis_url: None,
        database_url: None,
        metrics_token: None,
        api_rate_limit_per_minute: 120,
        require_device_signatures: false,
    };

    let state = AppState::new(config);
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sync")
                .header("content-type", "application/json")
                .header("x-device-id", "00000000-0000-4000-8000-000000000001")
                .body(Body::from(
                    r#"{
                        "list_id":"local-demo-list",
                        "last_sync":0,
                        "items":[{
                            "id":"item-1",
                            "list_id":"local-demo-list",
                            "name":"Pommes",
                            "barcode":null,
                            "category":"Fruits et légumes",
                            "quantity":2,
                            "checked":false,
                            "updated_at":1000,
                            "deleted_at":null
                        }]
                    }"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["list_id"], "local-demo-list");
    assert_eq!(payload["updated_items"][0]["name"], "Pommes");
    assert_eq!(payload["conflicts"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn health_response_sets_request_id() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .header("x-request-id", "00000000-0000-4000-8000-000000000099")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-request-id").unwrap(),
        "00000000-0000-4000-8000-000000000099"
    );
}

#[tokio::test]
async fn health_response_replaces_invalid_request_id() {
    let state = AppState::new(test_config());
    let app = create_router(state);
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .header("x-request-id", "untrusted-value")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let request_id = response
        .headers()
        .get("x-request-id")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(uuid::Uuid::parse_str(request_id).is_ok());
    assert_ne!(request_id, "untrusted-value");
}

#[tokio::test]
async fn metrics_endpoint_returns_counters() {
    let state = AppState::new(test_config());
    let app = create_router(state);

    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/products/abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let body = String::from_utf8(body.to_vec()).unwrap();

    assert!(body.contains("smartshopping_product_cache_hits_total"));
    assert!(body.contains("smartshopping_product_cache_hit_ratio"));
    assert!(body.contains("smartshopping_sync_attempts_total"));
    assert!(body.contains("smartshopping_http_request_duration_seconds_bucket"));
    assert!(body.contains("endpoint=\"/api/v1/products/:barcode\""));
}

#[tokio::test]
async fn metrics_endpoint_requires_configured_bearer_token() {
    let mut config = test_config();
    config.metrics_token = Some("0123456789abcdef0123456789abcdef".into());
    let app = create_router(AppState::new(config));

    let unauthorized = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let authorized = app
        .oneshot(
            Request::builder()
                .uri("/metrics")
                .header("authorization", "Bearer 0123456789abcdef0123456789abcdef")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(authorized.status(), StatusCode::OK);
}

#[tokio::test]
async fn api_rate_limit_returns_retry_after() {
    let mut config = test_config();
    config.api_rate_limit_per_minute = 1;
    let app = create_router(AppState::new(config));
    let request = || {
        Request::builder()
            .uri("/api/v1/categories")
            .body(Body::empty())
            .unwrap()
    };

    assert_eq!(
        app.clone().oneshot(request()).await.unwrap().status(),
        StatusCode::OK
    );
    let limited = app.oneshot(request()).await.unwrap();
    assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(limited.headers().get("retry-after").unwrap(), "60");
}

#[tokio::test]
async fn signed_device_requests_are_verified_and_replays_rejected() {
    let mut config = test_config();
    config.require_device_signatures = true;
    config.device_registry_path = temp_registry_path("signed-device");
    let app = create_router(AppState::new(config));
    let device_id = "00000000-0000-4000-8000-000000000099";
    let enrollment = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/devices/register")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"device_id":"{device_id}"}}"#)))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enrollment.status(), StatusCode::OK);
    let body = axum::body::to_bytes(enrollment.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let secret = payload["secret"].as_str().unwrap();

    let unsigned = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/categories")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unsigned.status(), StatusCode::UNAUTHORIZED);

    let timestamp = chrono::Utc::now().timestamp_millis();
    let request_id = "00000000-0000-4000-8000-000000000098";
    let body_hash = hex::encode(Sha256::digest([]));
    let message = format!("{timestamp}\n{request_id}\nGET\n/api/v1/categories\n{body_hash}");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(message.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    let signed_request = || {
        Request::builder()
            .uri("/api/v1/categories")
            .header("x-device-id", device_id)
            .header("x-request-id", request_id)
            .header("x-device-timestamp", timestamp.to_string())
            .header("x-device-signature", &signature)
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(signed_request())
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.oneshot(signed_request()).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
}

fn temp_registry_path(name: &str) -> String {
    std::env::temp_dir()
        .join(format!("smartshopping-{name}-{}.json", std::process::id()))
        .to_string_lossy()
        .to_string()
}

#[tokio::test]
async fn sync_persists_anonymous_device_profile() {
    let registry_path = temp_registry_path("device_profile");
    let config = Config {
        host: "0.0.0.0".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        product_cache_capacity: 100,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
        off_base_url: "https://world.openfoodfacts.org/api/v2".into(),
        enable_off_proxy: false,
        off_rate_limit_per_minute: 100,
        off_max_retries: 0,
        device_registry_path: registry_path.clone(),
        redis_url: None,
        database_url: None,
        metrics_token: None,
        api_rate_limit_per_minute: 120,
        require_device_signatures: false,
    };

    let state = AppState::new(config);
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sync")
                .header("content-type", "application/json")
                .header("x-device-id", "00000000-0000-4000-8000-000000000002")
                .body(Body::from(
                    r#"{"list_id":"local-demo-list","last_sync":0,"items":[]}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let persisted = std::fs::read_to_string(registry_path).unwrap();

    assert!(persisted.contains("00000000-0000-4000-8000-000000000002"));
    assert!(persisted.contains("sync_count"));
}

#[tokio::test]
async fn invitation_grants_sync_access_and_can_be_revoked() {
    let config = Config {
        host: "0.0.0.0".into(),
        port: 3000,
        cache_ttl_seconds: 60,
        product_cache_capacity: 100,
        allowed_origin: "http://localhost:8081".into(),
        enable_sync_endpoint: true,
        off_base_url: "https://world.openfoodfacts.org/api/v2".into(),
        enable_off_proxy: false,
        off_rate_limit_per_minute: 100,
        off_max_retries: 0,
        device_registry_path: temp_registry_path("sharing"),
        redis_url: None,
        database_url: None,
        metrics_token: None,
        api_rate_limit_per_minute: 120,
        require_device_signatures: false,
    };
    let app = create_router(AppState::new(config));
    let owner = "00000000-0000-4000-8000-000000000010";
    let guest = "00000000-0000-4000-8000-000000000011";
    let stranger = "00000000-0000-4000-8000-000000000012";

    let invalid = app.clone().oneshot(
        Request::builder().method("POST").uri("/api/v1/sync")
            .header("content-type", "application/json").header("x-device-id", stranger)
            .body(Body::from(r#"{"list_id":"shared-list","last_sync":0,"items":[{"id":"item-1","list_id":"shared-list","name":"Riz","quantity":0,"checked":false,"updated_at":1}]}"#))
            .unwrap(),
    ).await.unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

    let claim = app
        .clone()
        .oneshot(sync_request(owner, "shared-list"))
        .await
        .unwrap();
    assert_eq!(claim.status(), StatusCode::OK);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/lists/shared-list/invitations")
                .header("x-device-id", owner)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let invitation: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let code = invitation["code"].as_str().unwrap();

    let join = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/invitations/{code}/join"))
                .header("x-device-id", guest)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(join.status(), StatusCode::OK);
    assert_eq!(
        app.clone()
            .oneshot(sync_request(guest, "shared-list"))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let members = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/lists/shared-list/members")
                .header("x-device-id", owner)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(members.status(), StatusCode::OK);
    let removed = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/lists/shared-list/members/{guest}/revoke"))
                .header("x-device-id", owner)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(removed.status(), StatusCode::OK);
    assert_eq!(
        app.clone()
            .oneshot(sync_request(guest, "shared-list"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.clone()
            .oneshot(sync_request(stranger, "shared-list"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );

    let second_invitation = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/lists/shared-list/invitations")
                .header("x-device-id", owner)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = axum::body::to_bytes(second_invitation.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let code = payload["code"].as_str().unwrap();

    let revoke = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/invitations/{code}/revoke"))
                .header("x-device-id", owner)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(revoke.status(), StatusCode::OK);
    let late_guest = "00000000-0000-4000-8000-000000000013";
    let rejected = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/invitations/{code}/join"))
                .header("x-device-id", late_guest)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::NOT_FOUND);
}

fn sync_request(device_id: &str, list_id: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/v1/sync")
        .header("content-type", "application/json")
        .header("x-device-id", device_id)
        .body(Body::from(format!(
            r#"{{"list_id":"{list_id}","last_sync":0,"items":[]}}"#
        )))
        .unwrap()
}

fn test_config() -> Config {
    let mut config = Config::from_env();
    config.require_device_signatures = false;
    config
}
