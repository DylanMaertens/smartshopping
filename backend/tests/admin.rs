use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    response::Response,
    Router,
};
use serde_json::{json, Value};
use shopping_list_backend::{
    config::Config,
    routes::create_router,
    services::admin::{AdminState, Credentials},
    state::AppState,
};
use std::sync::{Arc, OnceLock};
use tower::ServiceExt;

const ORIGIN: &str = "https://admin.example.test";
const PASSWORD: &str = "Test-only password, not a deployed credential!";
fn state(enabled: bool) -> AppState {
    let mut config = Config::from_env();
    config.database_url = None;
    config.redis_url = None;
    config.metrics_token = None;
    config.enable_off_proxy = false;
    config.enable_sync_endpoint = true;
    config.require_device_signatures = true;
    config.device_registry_path = format!("/tmp/poduna-admin-test-{}.json", uuid::Uuid::new_v4());
    let mut state = AppState::new(config);
    state.contact_enabled = false;
    static HASH: OnceLock<String> = OnceLock::new();
    let hash = HASH.get_or_init(|| {
        Argon2::default()
            .hash_password(
                PASSWORD.as_bytes(),
                &SaltString::encode_b64(b"test-only-salt-16").unwrap(),
            )
            .unwrap()
            .to_string()
    });
    state.admin = Arc::new(AdminState::new(
        enabled.then(|| Credentials {
            username: "owner".into(),
            password_hash: hash.clone(),
        }),
        ORIGIN.into(),
    ));
    state
}
fn request(
    method: &str,
    path: &str,
    cookie: Option<&str>,
    csrf: Option<&str>,
    body: Value,
) -> Request<Body> {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "admin.example.test")
        .header("x-poduna-admin", "1")
        .header("sec-fetch-site", "same-origin");
    if method == "POST" {
        req = req
            .header("origin", ORIGIN)
            .header("content-type", "application/json");
    }
    if let Some(cookie) = cookie {
        req = req.header("cookie", cookie);
    }
    if let Some(csrf) = csrf {
        req = req.header("x-csrf-token", csrf);
    }
    req.extension(axum::extract::ConnectInfo(
        "127.0.0.1:12345".parse::<std::net::SocketAddr>().unwrap(),
    ))
    .body(if body.is_null() {
        Body::empty()
    } else {
        Body::from(body.to_string())
    })
    .unwrap()
}
async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap()).unwrap()
}
async fn login(app: &Router) -> (String, String) {
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            "/admin/api/login",
            None,
            None,
            json!({"username":"owner", "password": PASSWORD}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    for flag in [
        "__Host-poduna_admin=",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=28800",
    ] {
        assert!(cookie.contains(flag), "{flag}");
    }
    assert!(!cookie.contains("Domain="));
    let csrf = json_body(response).await["csrf"]
        .as_str()
        .unwrap()
        .to_owned();
    (cookie.split(';').next().unwrap().to_owned(), csrf)
}

#[tokio::test]
async fn private_reads_require_session_and_disabled_admin_fails_closed() {
    for enabled in [false, true] {
        let app = create_router(state(enabled));
        for route in [
            "queue-counts",
            "session",
            "overview",
            "logs",
            "queues/messages",
            "queues/proposals",
            "queues/reports",
        ] {
            let response = app
                .clone()
                .oneshot(request(
                    "GET",
                    &format!("/admin/api/{route}"),
                    None,
                    None,
                    Value::Null,
                ))
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                if enabled {
                    StatusCode::UNAUTHORIZED
                } else {
                    StatusCode::SERVICE_UNAVAILABLE
                }
            );
            assert_eq!(response.headers()["cache-control"], "no-store");
            assert!(!response
                .headers()
                .contains_key("access-control-allow-origin"));
        }
    }
}

#[tokio::test]
async fn login_logout_and_csrf_are_enforced() {
    let app = create_router(state(true));
    let (cookie, csrf) = login(&app).await;
    let response = app
        .clone()
        .oneshot(request(
            "GET",
            "/admin/api/session",
            Some(&cookie),
            None,
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(json_body(response).await["csrf"], csrf);
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            "/admin/api/logout",
            Some(&cookie),
            None,
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            "/admin/api/logout",
            Some(&cookie),
            Some(&csrf),
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .contains("Max-Age=0"));
    let response = app
        .oneshot(request(
            "GET",
            "/admin/api/logs",
            Some(&cookie),
            None,
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn rejects_foreign_missing_origins_hosts_and_simple_requests() {
    let app = create_router(state(true));
    for (header, value) in [
        ("origin", Some("https://evil.test")),
        ("origin", None),
        ("origin", Some("null")),
        ("host", Some("evil.test")),
        ("x-poduna-admin", None),
        ("sec-fetch-site", Some("cross-site")),
    ] {
        let mut req = request(
            "POST",
            "/admin/api/login",
            None,
            None,
            json!({"username":"owner", "password":PASSWORD}),
        );
        if let Some(value) = value {
            req.headers_mut().insert(header, value.parse().unwrap());
        } else {
            req.headers_mut().remove(header);
        }
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{header}");
        assert!(!response.headers().contains_key("set-cookie"));
    }
    let mut req = request(
        "POST",
        "/admin/api/login",
        None,
        None,
        json!({"username":"owner", "password":PASSWORD}),
    );
    req.extensions_mut().insert(axum::extract::ConnectInfo(
        "192.0.2.1:12345".parse::<std::net::SocketAddr>().unwrap(),
    ));
    req.headers_mut()
        .insert("x-forwarded-for", "127.0.0.1".parse().unwrap());
    req.headers_mut()
        .insert("x-forwarded-proto", "https".parse().unwrap());
    assert_eq!(
        app.oneshot(req).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn login_rate_limit_does_not_trust_forwarded_or_device_headers() {
    let app = create_router(state(true));
    for index in 0..11 {
        let mut req = request(
            "POST",
            "/admin/api/login",
            None,
            None,
            json!({"username":"unknown", "password":"wrong"}),
        );
        req.headers_mut().insert(
            "x-forwarded-for",
            format!("192.0.2.{index}").parse().unwrap(),
        );
        req.headers_mut().insert(
            "x-device-id",
            uuid::Uuid::new_v4().to_string().parse().unwrap(),
        );
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(
            response.status(),
            if index < 10 {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::TOO_MANY_REQUESTS
            }
        );
        if index == 10 {
            assert_eq!(response.headers()["retry-after"], "300");
        }
    }
}

#[tokio::test]
async fn diagnostics_are_real_bounded_and_redacted_including_rejections() {
    let state = state(true);
    let app = create_router(state.clone());
    let (cookie, _) = login(&app).await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/invitations/PRIVATE_INVITATION/join?token=PRIVATE_QUERY")
                .header("authorization", "Bearer PRIVATE_BEARER")
                .header("cookie", "private=PRIVATE_COOKIE")
                .body(Body::from("PRIVATE_LIST_CONTENT_AND_PHOTO"))
                .unwrap(),
        )
        .await
        .unwrap();
    let reference = response.headers()["x-request-id"]
        .to_str()
        .unwrap()
        .to_owned();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let overview = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/overview",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(overview["traffic"]["requests"], 1);
    assert_eq!(overview["traffic"]["rejected"], 1);
    assert_eq!(overview["services"]["postgres"], "not_configured");
    assert_eq!(overview["services"]["catalogues"], "disabled");
    let logs = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/logs",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    let text = logs.to_string();
    assert!(!text.contains("PRIVATE_"));
    assert!(!text.contains(PASSWORD));
    assert!(!text.contains(&cookie));
    assert!(text.contains("/api/v1/invitations/:code/join"));
    assert!(text.contains(&reference));
    assert!(text.contains("ADMIN_LOGIN_OK"));
    for _ in 0..1005 {
        state
            .admin
            .record(shopping_list_backend::services::admin::Event {
                time: String::new(),
                reference: String::new(),
                level: "info",
                service: "api",
                route: "/other",
                method: "GET",
                status: 200,
                duration_ms: 1,
                code: "HTTP_OK",
            });
    }
    assert_eq!(state.admin.events().len(), 1000);
}

#[tokio::test]
async fn session_forgery_duplicate_cookie_and_old_session_after_login_are_rejected() {
    let app = create_router(state(true));
    let (cookie, _) = login(&app).await;
    for value in [
        "__Host-poduna_admin=forged".to_owned(),
        format!("{cookie}; {cookie}"),
    ] {
        let response = app
            .clone()
            .oneshot(request(
                "GET",
                "/admin/api/overview",
                Some(&value),
                None,
                Value::Null,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            "/admin/api/login",
            Some(&cookie),
            None,
            json!({"username":"owner", "password":PASSWORD}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response = app
        .oneshot(request(
            "GET",
            "/admin/api/logs",
            Some(&cookie),
            None,
            Value::Null,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn private_metrics_are_not_public_when_unconfigured_and_pages_have_security_headers() {
    let app = create_router(state(true));
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/metrics", None, None, Value::Null))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    let response = app
        .oneshot(request("GET", "/admin/", None, None, Value::Null))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-frame-options"], "DENY");
    assert!(response.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .contains("frame-ancestors 'none'"));
    let html = String::from_utf8(
        to_bytes(response.into_body(), 100000)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(html.contains("data-backend=\"true\""));
    assert!(!html.contains(PASSWORD));
}

#[tokio::test]
async fn missing_dependencies_report_unavailable_without_connection_strings() {
    let mut state = state(true);
    state.config.database_url = Some("PRIVATE_DATABASE_URL".into());
    state.config.redis_url = Some("PRIVATE_REDIS_URL".into());
    let app = create_router(state);
    let (cookie, _) = login(&app).await;
    let overview = json_body(
        app.oneshot(request(
            "GET",
            "/admin/api/overview",
            Some(&cookie),
            None,
            Value::Null,
        ))
        .await
        .unwrap(),
    )
    .await;
    assert_eq!(overview["services"]["postgres"], "unavailable");
    assert_eq!(overview["services"]["redis"], "unavailable");
    assert!(!overview.to_string().contains("PRIVATE_"));
}

fn contact_request(body: Value) -> Request<Body> {
    let mut req = request("POST", "/api/v1/contact", None, None, body);
    req.headers_mut().remove("x-poduna-admin");
    req.headers_mut()
        .insert("x-poduna-contact", "1".parse().unwrap());
    req
}

#[tokio::test]
async fn workflows_require_csrf_and_database_and_contact_is_off_by_default() {
    let app = create_router(state(true));
    let (cookie, csrf) = login(&app).await;
    for kind in ["proposals", "reports", "messages"] {
        let path =
            format!("/admin/api/queues/{kind}/00000000-0000-4000-8000-000000000001/decision");
        let body =
            json!({"action":"withdraw","reason":"fixture reason","version":1,"status":"pending"});
        assert_eq!(
            app.clone()
                .oneshot(request("POST", &path, Some(&cookie), None, body.clone()))
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            app.clone()
                .oneshot(request(
                    "GET",
                    &format!("/admin/api/queues/{kind}"),
                    Some(&cookie),
                    None,
                    Value::Null
                ))
                .await
                .unwrap()
                .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        let response = app
            .clone()
            .oneshot(request("POST", &path, Some(&cookie), Some(&csrf), body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
    let response = app
        .clone()
        .oneshot(contact_request(json!({})))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(json_body(response).await["code"], "CONTACT_DISABLED");
    assert_eq!(
        app.oneshot(request("GET", "/api/v1/contact", None, None, Value::Null))
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE // Even unsupported methods fail closed while disabled.
    );
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn durable_contact_and_moderation_workflows() {
    use shopping_list_backend::{db::prepare_database, services::community_catalog::*};
    use uuid::Uuid;
    let mut state = state(true);
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    state.db_pool = Some(pool.clone());
    state.contact_enabled = true;
    let app = create_router(state.clone());
    let (cookie, csrf) = login(&app).await;
    let id = Uuid::new_v4();
    let email = format!("{}@example.invalid", Uuid::new_v4());
    let body = json!({"id":id,"email":email,"topic":"technical","body":"PRIVATE_MESSAGE <img src=x onerror=alert(1)>"});
    for (key, value) in [
        ("email", json!("invalid-address")),
        ("topic", json!("unknown")),
        ("body", json!("too short")),
        ("website", json!("spam")),
        ("extra", json!("forbidden")),
    ] {
        let mut invalid = body.clone();
        invalid[key] = value;
        let response = app.clone().oneshot(contact_request(invalid)).await.unwrap();
        assert!(matches!(
            response.status(),
            StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY
        ));
    }
    let mut oversized = body.clone();
    oversized["body"] = "x".repeat(17_000).into();
    assert_eq!(
        app.clone()
            .oneshot(contact_request(oversized))
            .await
            .unwrap()
            .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    let mut get = request("GET", "/api/v1/contact", None, None, Value::Null);
    get.headers_mut()
        .insert("x-poduna-contact", "1".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(get).await.unwrap().status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
    for header in ["origin", "x-poduna-contact"] {
        let mut req = contact_request(body.clone());
        req.headers_mut().remove(header);
        assert_eq!(
            app.clone().oneshot(req).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
    }
    let mut req = contact_request(body.clone());
    req.headers_mut()
        .insert("origin", "https://evil.test".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(req).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let mut req = contact_request(body.clone());
    req.extensions_mut().insert(axum::extract::ConnectInfo(
        "192.0.2.1:1234".parse::<std::net::SocketAddr>().unwrap(),
    ));
    req.headers_mut()
        .insert("x-forwarded-for", "127.0.0.1".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(req).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let (a, b) = tokio::join!(
        app.clone().oneshot(contact_request(body.clone())),
        app.clone().oneshot(contact_request(body.clone()))
    );
    for response in [a.unwrap(), b.unwrap()] {
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(json_body(response).await["reference"], id.to_string());
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM contact_messages WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    let mut changed = body.clone();
    changed["body"] = "Different message with the same reference".into();
    assert_eq!(
        app.clone()
            .oneshot(contact_request(changed))
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    let path = format!("/admin/api/queues/messages/{id}");
    let detail = json_body(
        app.clone()
            .oneshot(request("GET", &path, Some(&cookie), None, Value::Null))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(detail["item"]["body"], body["body"]);
    let search_path = format!("/admin/api/queues/messages?search={id}");
    let found = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                &search_path,
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(found["total"], 1);
    assert!(found["items"][0].get("body").is_none());
    let found = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/queues/messages?search=technique",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert!(found["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["id"] == id.to_string()));
    let decision =
        json!({"action":"active","reason":"Examen du problème signalé","version":1,"status":"new"});
    let (a, b) = tokio::join!(
        app.clone().oneshot(request(
            "POST",
            &format!("{path}/decision"),
            Some(&cookie),
            Some(&csrf),
            decision.clone()
        )),
        app.clone().oneshot(request(
            "POST",
            &format!("{path}/decision"),
            Some(&cookie),
            Some(&csrf),
            decision
        ))
    );
    let mut statuses = [a.unwrap().status().as_u16(), b.unwrap().status().as_u16()];
    statuses.sort();
    assert_eq!(statuses, [200, 409]);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM admin_decisions WHERE subject_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    // Audit failure rolls back the state update in the same transaction.
    sqlx::query("ALTER TABLE admin_decisions ADD CONSTRAINT test_audit_failure CHECK(reason <> 'ROLLBACK_FIXTURE')").execute(&pool).await.unwrap();
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            &format!("{path}/decision"),
            Some(&cookie),
            Some(&csrf),
            json!({"action":"closed","reason":"ROLLBACK_FIXTURE","version":2,"status":"active"}),
        ))
        .await
        .unwrap();
    sqlx::query("ALTER TABLE admin_decisions DROP CONSTRAINT test_audit_failure")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM contact_messages WHERE id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
        "active"
    );
    // Per-email durable quota, independent of new app process/local rate limiter.
    for index in 0..3 {
        let mut extra = body.clone();
        extra["id"] = Uuid::new_v4().to_string().into();
        let response = app.clone().oneshot(contact_request(extra)).await.unwrap();
        assert_eq!(
            response.status(),
            if index < 2 {
                StatusCode::OK
            } else {
                StatusCode::TOO_MANY_REQUESTS
            }
        );
    }
    // A genuinely consensus-validated proposal can be withdrawn, never force-approved.
    let barcode = format!("{:014}", Uuid::new_v4().as_u128() % 100_000_000_000_000);
    let mut devices = Vec::new();
    for _ in 0..5 {
        let device = Uuid::new_v4().to_string();
        state.enroll_device(&device).await.unwrap();
        devices.push(device);
    }
    let proposal = submit_proposals(
        &pool,
        &barcode,
        &devices[0],
        ProposalInput {
            name: Some("Nouilles de riz".into()),
            category: None,
        },
        &state.config,
    )
    .await
    .unwrap()
    .proposal_ids[0];
    for device in &devices[1..] {
        confirm(&pool, proposal, device, true, &state.config)
            .await
            .unwrap();
    }
    assert!(validated_product(&pool, &barcode, &state.config)
        .await
        .unwrap()
        .is_some());
    state
        .products_cache
        .insert(
            barcode.clone(),
            shopping_list_backend::models::product::ProductResponse {
                barcode: barcode.clone(),
                product_name: "Nouilles de riz".into(),
                categories: vec![],
                image_url: None,
                cached: false,
                stale: false,
                source: "community".into(),
                ttl_seconds: 60,
            },
        )
        .await;
    let report_id = report(&pool, proposal, &devices[1], "wrong_name")
        .await
        .unwrap()
        .unwrap();
    let path = format!("/admin/api/queues/reports/{report_id}");
    let detail = json_body(
        app.clone()
            .oneshot(request("GET", &path, Some(&cookie), None, Value::Null))
            .await
            .unwrap(),
    )
    .await;
    assert!(!detail.to_string().contains(&devices[0]));
    assert_eq!(detail["related"][0]["agrees"], 5);
    assert_eq!(detail["related"][0]["total_voters"], 5);
    let invalid_approval = json!({"action":"approve","reason":"Validation manuelle interdite","status":"validated","version":detail["item"]["proposal_version"]});
    assert_eq!(
        app.clone()
            .oneshot(request(
                "POST",
                &format!("/admin/api/queues/proposals/{proposal}/decision"),
                Some(&cookie),
                Some(&csrf),
                invalid_approval
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    let decision = json!({"action":"withdraw","reason":"Nom incorrect après vérification","status":"pending","version":0,"proposal_version":detail["item"]["proposal_version"]});
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            &format!("{path}/decision"),
            Some(&cookie),
            Some(&csrf),
            decision.clone(),
        ))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::OK,
        "{}",
        json_body(response).await
    );
    assert_eq!(
        app.clone()
            .oneshot(request(
                "POST",
                &format!("{path}/decision"),
                Some(&cookie),
                Some(&csrf),
                decision
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    assert!(validated_product(&pool, &barcode, &state.config)
        .await
        .unwrap()
        .is_none());
    assert!(state.products_cache.get(&barcode).await.is_none());
    assert_eq!(
        sqlx::query_scalar::<_, String>(
            "SELECT status FROM community_product_proposals WHERE id=$1"
        )
        .bind(proposal)
        .fetch_one(&pool)
        .await
        .unwrap(),
        "revoked"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM admin_decisions WHERE subject_id=$1 OR subject_id=$2"
        )
        .bind(proposal)
        .bind(report_id)
        .fetch_one(&pool)
        .await
        .unwrap(),
        2
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM community_contributor_restrictions WHERE device_id=$1"
        )
        .bind(&devices[0])
        .fetch_one(&pool)
        .await
        .unwrap(),
        0
    );
    let logs = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/logs",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await
    .to_string();
    for private in [
        &email,
        "PRIVATE_MESSAGE",
        &id.to_string(),
        &proposal.to_string(),
        "Nom incorrect après vérification",
    ] {
        assert!(!logs.contains(private));
    }
    assert!(!state.config.enable_community_catalog);
    // A fresh server instance reads durable state, while its contact endpoint stays disabled.
    let mut restarted = self::state(true);
    restarted.db_pool = Some(pool.clone());
    let new_app = create_router(restarted);
    let (new_cookie, _) = login(&new_app).await;
    let data = json_body(
        new_app
            .oneshot(request(
                "GET",
                &format!("/admin/api/queues/messages/{id}"),
                Some(&new_cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(data["item"]["status"], "active");
    assert_eq!(data["history"][0]["actor"], "owner");
    pool.close().await;
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn moderation_filters_pagination_and_non_withdrawing_decisions() {
    use shopping_list_backend::{db::prepare_database, services::community_catalog::report};
    use uuid::Uuid;
    let mut state = state(true);
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    state.db_pool = Some(pool.clone());
    let device = Uuid::new_v4().to_string();
    state.enroll_device(&device).await.unwrap();
    let barcode = format!("{:014}", Uuid::new_v4().as_u128() % 100_000_000_000_000);
    let ids: Vec<Uuid> = sqlx::query_scalar("INSERT INTO community_product_proposals(id,barcode,field_name,value,normalized_value,contributor_device_id,created_at,updated_at) SELECT gen_random_uuid(),$1,'name','Fixture '||n,'fixture '||n,$2,100,100 FROM generate_series(1,53) n RETURNING id")
        .bind(&barcode).bind(&device).fetch_all(&pool).await.unwrap();
    let app = create_router(state);
    let (cookie, csrf) = login(&app).await;
    let mut seen = std::collections::HashSet::new();
    for offset in [0, 50] {
        let data = json_body(
            app.clone()
                .oneshot(request(
                    "GET",
                    &format!("/admin/api/queues/proposals?status=pending&offset={offset}"),
                    Some(&cookie),
                    None,
                    Value::Null,
                ))
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(data["has_more"], offset == 0);
        assert_eq!(
            data["items"].as_array().unwrap().len(),
            if offset == 0 { 50 } else { 3 }
        );
        for item in data["items"].as_array().unwrap() {
            assert!(seen.insert(item["id"].as_str().unwrap().to_owned()));
        }
        assert!(!data.to_string().contains(&device));
    }
    assert_eq!(seen.len(), 53);
    let counts = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/queue-counts",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(counts["proposals"], 53);
    for (search, total) in [
        ("Fixture%2053", 1),
        ("fIxTuRe", 53),
        ("%25", 0),
        ("%27%20OR%201%3D1--", 0),
    ] {
        let result = json_body(
            app.clone()
                .oneshot(request(
                    "GET",
                    &format!("/admin/api/queues/proposals?status=pending&search={search}"),
                    Some(&cookie),
                    None,
                    Value::Null,
                ))
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(result["total"], total, "literal search {search}");
    }
    let special = "Produit %_ privé";
    sqlx::query("UPDATE community_product_proposals SET value=$2 WHERE id=$1")
        .bind(ids[0])
        .bind(special)
        .execute(&pool)
        .await
        .unwrap();
    let literal = json_body(
        app.clone()
            .oneshot(request(
                "GET",
                "/admin/api/queues/proposals?status=pending&search=%25_",
                Some(&cookie),
                None,
                Value::Null,
            ))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(literal["total"], 1);
    assert_eq!(literal["items"][0]["value"], special);
    let oversized = format!("/admin/api/queues/proposals?search={}", "a".repeat(121));
    assert_eq!(
        app.clone()
            .oneshot(request("GET", &oversized, Some(&cookie), None, Value::Null))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    for query in ["status=invalid", "offset=100001"] {
        assert_eq!(
            app.clone()
                .oneshot(request(
                    "GET",
                    &format!("/admin/api/queues/proposals?{query}"),
                    Some(&cookie),
                    None,
                    Value::Null
                ))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
    }
    let proposal = ids[0];
    for (action, reason, result) in [
        ("dismiss", "spam", "dismissed"),
        ("uphold", "wrong_name", "upheld"),
    ] {
        let id = report(&pool, proposal, &device, reason)
            .await
            .unwrap()
            .unwrap();
        let response = app.clone().oneshot(request("POST",&format!("/admin/api/queues/reports/{id}/decision"),Some(&cookie),Some(&csrf),json!({"action":action,"reason":"Examen sans retrait de la proposition","status":"pending","version":0,"proposal_version":100}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(json_body(response).await["status"], result);
        assert_eq!(
            sqlx::query_scalar::<_, String>(
                "SELECT status FROM community_product_proposals WHERE id=$1"
            )
            .bind(proposal)
            .fetch_one(&pool)
            .await
            .unwrap(),
            "pending"
        );
    }
    let response = app.clone().oneshot(request("POST",&format!("/admin/api/queues/proposals/{proposal}/decision"),Some(&cookie),Some(&csrf),json!({"action":"withdraw","reason":"Rejet direct après vérification","status":"pending","version":100}))).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["status"], "rejected");
    // Fixtures removed from pending queue so this ignored test can be rerun on the test DB.
    sqlx::query("UPDATE community_product_proposals SET status='rejected' WHERE barcode=$1")
        .bind(barcode)
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
}
