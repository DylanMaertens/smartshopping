use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use shopping_list_backend::{
    config::Config, db::prepare_database, routes::create_router, services::community_catalog::*,
    state::AppState,
};
use tower::ServiceExt;
use uuid::Uuid;

fn signed(path: &str, device: &str, secret: &str, body: &str) -> Request<Body> {
    let id = Uuid::new_v4().to_string();
    let time = chrono::Utc::now().timestamp_millis();
    let message = format!(
        "{time}\n{id}\nPOST\n{path}\n{}",
        hex::encode(Sha256::digest(body.as_bytes()))
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(message.as_bytes());
    Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .header("x-device-id", device)
        .header("x-request-id", id)
        .header("x-device-timestamp", time.to_string())
        .header(
            "x-device-signature",
            hex::encode(mac.finalize().into_bytes()),
        )
        .body(Body::from(body.to_owned()))
        .unwrap()
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn community_persistence_consensus_privacy_and_signed_routes() {
    let mut config = Config::from_env();
    config.database_url = Some(std::env::var("TEST_DATABASE_URL").unwrap());
    config.redis_url = None;
    config.enable_community_catalog = true;
    config.require_device_signatures = true;
    config.enable_off_proxy = false;
    config.community_consensus_min_devices = 5;
    config.community_consensus_ratio = 0.8;
    let state = AppState::new(config.clone());
    let pool = state.db_pool.as_ref().unwrap();
    prepare_database(pool).await.unwrap();
    let mut devices = vec![];
    for _ in 0..8 {
        let device = Uuid::new_v4().to_string();
        let secret = state.enroll_device(&device).await.unwrap().unwrap();
        devices.push((device, secret));
    }
    let barcode = format!("{:014}", Uuid::new_v4().as_u128() % 100_000_000_000_000);
    let receipt = submit_proposals(
        pool,
        &barcode,
        &devices[0].0,
        ProposalInput {
            name: Some("Lait entier".into()),
            category: Some("Boissons".into()),
        },
        &config,
    )
    .await
    .unwrap();
    let name = receipt.proposal_ids[0];
    let category = receipt.proposal_ids[1];
    assert!(validated_product(pool, &barcode, &config)
        .await
        .unwrap()
        .is_none());
    for _ in 0..4 {
        confirm(pool, name, &devices[0].0, true, &config)
            .await
            .unwrap();
    }
    assert_eq!(
        suggestions(pool, &barcode)
            .await
            .unwrap()
            .suggestions
            .iter()
            .find(|s| s.proposal_id == name)
            .unwrap()
            .confirmations,
        1
    );
    for device in &devices[1..4] {
        confirm(pool, name, &device.0, true, &config).await.unwrap();
    }
    confirm(pool, name, &devices[4].0, false, &config)
        .await
        .unwrap();
    // 4/5 = 80% is not FIVE confirmations.
    assert!(validated_product(pool, &barcode, &config)
        .await
        .unwrap()
        .is_none());
    let (a, b) = tokio::join!(
        confirm(pool, name, &devices[4].0, true, &config),
        confirm(pool, name, &devices[5].0, true, &config)
    );
    a.unwrap();
    b.unwrap();
    let found = validated_product(pool, &barcode, &config)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(found.name, "Lait entier");
    assert!(found.category.is_none());
    // Exercise the entire external -> community lookup with four local mock sources.
    let calls = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let received = calls.clone();
    let router = axum::Router::new().route(
        "/:source/product/:barcode",
        axum::routing::get(
            move |axum::extract::Path((source, _)): axum::extract::Path<(String, String)>| {
                received.lock().unwrap().push(source);
                async { axum::Json(serde_json::json!({"status":0})) }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let mut lookup_state = state.clone();
    lookup_state.config.enable_off_proxy = true;
    lookup_state.product_clients = ["food", "products", "beauty", "petfood"]
        .into_iter()
        .map(|source| {
            (
                source,
                shopping_list_backend::services::openfoodfacts::OpenFoodFactsClient::new(
                    format!("http://{address}/{source}"),
                    100,
                    0,
                ),
            )
        })
        .collect();
    let product = shopping_list_backend::handlers::products::get_product(
        axum::extract::State(lookup_state.clone()),
        axum::extract::Path(barcode.clone()),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(product.source, "community");
    assert!(product.categories.is_empty());
    assert_eq!(
        *calls.lock().unwrap(),
        ["food", "products", "beauty", "petfood"]
    );
    assert!(suggestions(pool, &barcode)
        .await
        .unwrap()
        .suggestions
        .iter()
        .any(|s| s.proposal_id == category));
    // A changed vote withdraws the previous support and can remove consensus.
    let other = submit_proposals(
        pool,
        &barcode,
        &devices[1].0,
        ProposalInput {
            name: Some("Lait écrémé".into()),
            category: None,
        },
        &config,
    )
    .await
    .unwrap()
    .proposal_ids[0];
    confirm(pool, other, &devices[2].0, true, &config)
        .await
        .unwrap();
    assert!(validated_product(pool, &barcode, &config)
        .await
        .unwrap()
        .is_none());
    let missing = shopping_list_backend::handlers::products::get_product(
        axum::extract::State(lookup_state.clone()),
        axum::extract::Path(barcode.clone()),
    )
    .await
    .err()
    .unwrap();
    assert_eq!(missing.status, StatusCode::NOT_FOUND); // Does not reuse a now-unvalidated server cache entry.
    server.abort();
    lookup_state.product_clients = vec![(
        "unavailable",
        shopping_list_backend::services::openfoodfacts::OpenFoodFactsClient::new(
            "http://127.0.0.1:1".into(),
            100,
            0,
        ),
    )];
    let unavailable = shopping_list_backend::handlers::products::get_product(
        axum::extract::State(lookup_state),
        axum::extract::Path(barcode.clone()),
    )
    .await
    .err()
    .unwrap();
    assert_eq!(unavailable.status, StatusCode::SERVICE_UNAVAILABLE);
    // Reports are idempotent and never create restrictions automatically.
    let first = report(pool, name, &devices[6].0, "wrong_name")
        .await
        .unwrap();
    assert_eq!(
        first,
        report(pool, name, &devices[6].0, "wrong_name")
            .await
            .unwrap()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM community_contributor_restrictions WHERE device_id=$1"
        )
        .bind(&devices[0].0)
        .fetch_one(pool)
        .await
        .unwrap(),
        0
    );
    let restriction = Uuid::new_v4();
    assert!(sqlx::query("INSERT INTO community_contributor_restrictions(id,device_id,report_id,starts_at,reason,created_by) VALUES($1,$2,$3,0,'unexamined case','integration')")
        .bind(restriction).bind(&devices[0].0).bind(first).execute(pool).await.is_err());
    sqlx::query("UPDATE community_proposal_reports SET status='upheld',reviewed_at=1,reviewed_by='integration' WHERE id=$1")
        .bind(first).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO community_contributor_restrictions(id,device_id,report_id,starts_at,reason,created_by) VALUES($1,$2,$3,0,'test examined case','integration')")
        .bind(restriction).bind(&devices[0].0).bind(first).execute(pool).await.unwrap();
    assert!(!suggestions(pool, &barcode)
        .await
        .unwrap()
        .suggestions
        .iter()
        .any(|s| s.proposal_id == name));
    let ignored = submit_proposals(
        pool,
        &barcode,
        &devices[0].0,
        ProposalInput {
            name: Some("Hidden contribution".into()),
            category: None,
        },
        &config,
    )
    .await
    .unwrap();
    assert!(ignored.proposal_ids.is_empty());
    assert_eq!(ignored.publication_status, "received");
    sqlx::query("UPDATE community_contributor_restrictions SET lifted_at=1,lifted_by='integration' WHERE id=$1").bind(restriction).execute(pool).await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM community_product_proposals WHERE barcode=$1 AND value='Hidden contribution'").bind(&barcode).fetch_one(pool).await.unwrap(),0);
    for i in 0..4 {
        submit_proposals(
            pool,
            &barcode,
            &devices[7].0,
            ProposalInput {
                name: Some(format!("Variante {i}")),
                category: None,
            },
            &config,
        )
        .await
        .unwrap();
    }
    assert_eq!(
        suggestions(pool, &barcode).await.unwrap().suggestions.len(),
        3
    );
    // HTTP writes must reject an unsigned request even with a plausible UUID.
    let app = create_router(state.clone());
    let path = format!("/api/v1/community/products/{barcode}/proposals");
    assert_eq!(
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(&path)
                    .header("content-type", "application/json")
                    .header("x-device-id", &devices[6].0)
                    .body(Body::from(r#"{"name":"Signed name"}"#))
                    .unwrap()
            )
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let request = signed(
        &path,
        &devices[6].0,
        &devices[6].1,
        r#"{"name":"Signed name"}"#,
    );
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let body: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
    assert_eq!(body["publication_status"], "received");
    // Durable quota survives recreating an AppState.
    sqlx::query("UPDATE community_daily_writes SET writes=100 WHERE device_id=$1")
        .bind(&devices[6].0)
        .execute(pool)
        .await
        .unwrap();
    let restarted = create_router(AppState::new(config));
    assert_eq!(
        restarted
            .oneshot(signed(
                &path,
                &devices[6].0,
                &devices[6].1,
                r#"{"name":"Another name"}"#
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
}
