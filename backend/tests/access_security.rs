use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use shopping_list_backend::{
    config::Config,
    db::prepare_database,
    routes::create_router,
    services::{
        access_security::{self, Decision},
        admin::Event,
    },
    state::AppState,
};
use tower::ServiceExt;
use uuid::Uuid;

fn signed(device: Uuid, secret: &str) -> Request<Body> {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().timestamp_millis();
    let path = "/api/v1/categories?private=never-log-this";
    let message = format!(
        "{now}\n{id}\nGET\n{path}\n{}",
        hex::encode(Sha256::digest(b""))
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(message.as_bytes());
    Request::builder()
        .uri(path)
        .header("x-device-id", device.to_string())
        .header("x-device-timestamp", now.to_string())
        .header("x-request-id", id.to_string())
        .header(
            "x-device-signature",
            hex::encode(mac.finalize().into_bytes()),
        )
        .header("cf-connecting-ip", "192.0.2.45")
        .body(Body::empty())
        .unwrap()
}

#[test]
fn decisions_are_bounded_and_reject_controls() {
    let mut d = Decision {
        device_id: Uuid::new_v4(),
        expected_version: None,
        minutes: 15,
        reason: "Valid test reason".into(),
    };
    assert!(d.valid());
    d.minutes = 10080;
    assert!(!d.valid());
    d.minutes = 0;
    assert!(d.valid());
    d.reason = "short".into();
    assert!(!d.valid());
    d.reason = "secret\ncontrol message".into();
    assert!(!d.valid());
    d.reason = "a".repeat(501);
    assert!(!d.valid());
}

#[tokio::test]
async fn extreme_signature_timestamp_is_rejected_without_overflow() {
    let mut config = Config::from_env();
    config.database_url = None;
    config.redis_url = None;
    config.require_device_signatures = true;
    let app = create_router(AppState::new(config));
    let mut request = signed(Uuid::new_v4(), "test-secret");
    request.headers_mut().insert("x-device-timestamp", i64::MIN.to_string().parse().unwrap());
    assert_eq!(app.oneshot(request).await.unwrap().status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL on a disposable PostgreSQL cluster"]
async fn signed_blocks_are_durable_expire_and_cannot_be_spoofed() {
    let mut config = Config::from_env();
    config.database_url = Some(std::env::var("TEST_DATABASE_URL").unwrap());
    config.redis_url = None;
    config.require_device_signatures = true;
    config.enable_off_proxy = false;
    let state = AppState::new(config);
    let pool = state.db_pool.as_ref().unwrap();
    prepare_database(pool).await.unwrap();
    let device = Uuid::new_v4();
    let other = Uuid::new_v4();
    let secret = state
        .enroll_device(&device.to_string())
        .await
        .unwrap()
        .unwrap();
    let other_secret = state
        .enroll_device(&other.to_string())
        .await
        .unwrap()
        .unwrap();
    let app = create_router(state.clone());
    assert_eq!(
        app.clone()
            .oneshot(signed(device, &secret))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let decision = Decision {
        device_id: device,
        expected_version: None,
        minutes: 15,
        reason: "Suspicious repeated requests".into(),
    };
    let (a, b) = tokio::join!(
        access_security::decide(pool, &decision, "test-admin"),
        access_security::decide(pool, &decision, "test-admin")
    );
    let results = [a.unwrap(), b.unwrap()];
    assert_eq!(results.iter().filter(|x| **x).count(), 1);
    assert!(access_security::blocked(pool, &device.to_string())
        .await
        .unwrap());
    // New state simulates restart; enforcement reads the committed DB, not process memory.
    let restarted = create_router(AppState::new(state.config.clone()));
    assert_eq!(
        restarted
            .oneshot(signed(device, &secret))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.clone()
            .oneshot(signed(other, &other_secret))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.clone()
            .oneshot(signed(device, &other_secret))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let row: (Option<String>, String) =
        sqlx::query_as("SELECT device_id,route FROM access_events ORDER BY id DESC LIMIT 1")
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(
        row,
        (None, "/api/v1/categories".into()),
        "Forged identity never attributed; query string never stored"
    );
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM security_decisions WHERE device_id=$1")
            .bind(device.to_string())
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let version: Uuid =
        sqlx::query_scalar("SELECT version FROM device_access_blocks WHERE device_id=$1")
            .bind(device.to_string())
            .fetch_one(pool)
            .await
            .unwrap();
    let unblock = Decision {
        expected_version: Some(version),
        minutes: 0,
        ..decision
    };
    assert!(access_security::decide(pool, &unblock, "test-admin")
        .await
        .unwrap());
    assert_eq!(
        app.clone()
            .oneshot(signed(device, &secret))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    sqlx::query("UPDATE device_access_blocks SET expires_at=1 WHERE device_id=$1")
        .bind(device.to_string())
        .execute(pool)
        .await
        .unwrap();
    assert!(!access_security::blocked(pool, &device.to_string())
        .await
        .unwrap());
    // Expiry and history survive restart. Authentication material is never in the journal.
    let journal: String =
        sqlx::query_scalar("SELECT coalesce(json_agg(t)::text,'[]') FROM access_events t")
            .fetch_one(pool)
            .await
            .unwrap();
    for private in [&secret, &other_secret, "never-log-this", "192.0.2.45"] {
        assert!(!journal.contains(private));
    }
    // A known secret cached before a DB outage must not bypass the restriction check.
    pool.close().await;
    assert_eq!(
        app.oneshot(signed(device, &secret)).await.unwrap().status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL on a disposable PostgreSQL cluster"]
async fn journal_is_bounded_and_old_events_are_pruned() {
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    sqlx::query("INSERT INTO access_events(created_at,reference,route,method,service,status,code) SELECT 1,'fixture','/other','GET','api',200,'HTTP_OK' FROM generate_series(1,5100)").execute(&pool).await.unwrap();
    let log = access_security::AccessJournal::default();
    log.record(
        &pool,
        &Event {
            time: String::new(),
            reference: Uuid::new_v4().to_string(),
            route: "/api/v1/categories",
            method: "GET",
            service: "api",
            status: 200,
            duration_ms: 0,
            code: "HTTP_OK",
            level: "info",
        },
        None,
    )
    .await;
    assert_eq!(log.dropped(), 0);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM access_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(count <= 5000);
    let old: i64 = sqlx::query_scalar("SELECT count(*) FROM access_events WHERE created_at=1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(old, 0);
}
