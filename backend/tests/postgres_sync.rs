use shopping_list_backend::{
    db::prepare_database,
    handlers::sync::SyncItem,
    services::device_auth,
    services::persistent_sync::{load_sync_items, persist_sync_items},
    services::sharing::SharingService,
};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn migrations_and_lww_sync_are_durable() {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .expect("TEST_DATABASE_URL is required for the PostgreSQL integration test");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("failed to connect to TEST_DATABASE_URL");

    prepare_database(&pool)
        .await
        .expect("failed to apply migrations");

    let suffix = Uuid::new_v4().to_string();
    let device_id = Uuid::new_v4().to_string();
    let list_id = format!("integration-list-{suffix}");
    let item_id = format!("integration-item-{suffix}");
    let original = sync_item(&item_id, &list_id, "Lait", 100);

    persist_sync_items(&pool, &device_id, &list_id, &[original])
        .await
        .expect("failed to persist initial item");

    let older = sync_item(&item_id, &list_id, "Ancienne valeur", 50);
    persist_sync_items(&pool, &device_id, &list_id, &[older])
        .await
        .expect("failed to apply older update");

    let loaded = load_sync_items(&pool, &list_id)
        .await
        .expect("failed to reload persisted items");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].name, "Lait");
    assert_eq!(loaded[0].updated_at, 100);

    sqlx::query("DELETE FROM shared_lists WHERE id = $1")
        .bind(&list_id)
        .execute(&pool)
        .await
        .expect("failed to clean integration list");
    sqlx::query("DELETE FROM anonymous_devices WHERE device_id = $1")
        .bind(&device_id)
        .execute(&pool)
        .await
        .expect("failed to clean integration device");
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn invitations_are_durable_authorized_and_revocable() {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .expect("TEST_DATABASE_URL is required for the PostgreSQL integration test");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("failed to connect to TEST_DATABASE_URL");
    prepare_database(&pool)
        .await
        .expect("failed to apply migrations");

    let owner = Uuid::new_v4().to_string();
    let guest = Uuid::new_v4().to_string();
    let stranger = Uuid::new_v4().to_string();
    let list_id = format!("integration-list-{}", Uuid::new_v4());
    persist_sync_items(&pool, &owner, &list_id, &[])
        .await
        .expect("failed to claim list");
    let cipher = shopping_list_backend::services::secret_cipher::SecretCipher::from_base64_keys(
        "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
        None,
    )
    .unwrap();
    let auth_secret = device_auth::enroll(&pool, &cipher, &owner)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        device_auth::get_secret(&pool, &cipher, &owner)
            .await
            .unwrap(),
        Some(auth_secret.clone())
    );
    assert_eq!(
        device_auth::enroll(&pool, &cipher, &owner).await.unwrap(),
        None
    );
    let stored: String =
        sqlx::query_scalar("SELECT auth_secret FROM anonymous_devices WHERE device_id = $1")
            .bind(&owner)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(stored.starts_with("enc:v1:"));
    let rotated = device_auth::rotate(&pool, &cipher, &owner)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(rotated, auth_secret);
    let sharing = SharingService::default();

    let invitation = sharing
        .create_invitation(Some(&pool), &list_id, &owner)
        .await
        .expect("failed to create invitation")
        .expect("owner should be authorized");
    assert_eq!(
        sharing
            .join(Some(&pool), &invitation.code, &guest)
            .await
            .unwrap(),
        Some(list_id.clone())
    );
    assert!(sharing
        .authorize_or_claim(Some(&pool), &list_id, &guest)
        .await
        .unwrap());
    let members = sharing
        .list_members(Some(&pool), &list_id, &owner)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(
        sharing
            .remove_member(Some(&pool), &list_id, &owner, &guest)
            .await
            .unwrap(),
        Some(true)
    );
    assert!(!sharing
        .authorize_or_claim(Some(&pool), &list_id, &guest)
        .await
        .unwrap());
    let replacement = Uuid::new_v4().to_string();
    let recovery_invitation = sharing
        .create_invitation(Some(&pool), &list_id, &owner)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        sharing
            .join(Some(&pool), &recovery_invitation.code, &replacement)
            .await
            .unwrap(),
        Some(list_id.clone())
    );
    assert!(sharing
        .authorize_or_claim(Some(&pool), &list_id, &replacement)
        .await
        .unwrap());
    assert!(!sharing
        .authorize_or_claim(Some(&pool), &list_id, &stranger)
        .await
        .unwrap());
    assert_eq!(
        sharing
            .join(Some(&pool), &invitation.code, &stranger)
            .await
            .unwrap(),
        None
    );
    let second = sharing
        .create_invitation(Some(&pool), &list_id, &owner)
        .await
        .unwrap()
        .unwrap();
    assert!(sharing
        .revoke(Some(&pool), &second.code, &owner)
        .await
        .unwrap());
    assert_eq!(
        sharing
            .delete_list(Some(&pool), &list_id, &guest)
            .await
            .unwrap(),
        Some(false)
    );
    assert_eq!(
        sharing
            .delete_list(Some(&pool), &list_id, &owner)
            .await
            .unwrap(),
        Some(true)
    );
    assert!(!sharing
        .authorize_or_claim(Some(&pool), &list_id, &owner)
        .await
        .unwrap());
    let deleted: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM deleted_lists WHERE id = $1)")
            .bind(&list_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted);

    sqlx::query("DELETE FROM deleted_lists WHERE id = $1")
        .bind(&list_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM anonymous_devices WHERE device_id = $1")
        .bind(&owner)
        .execute(&pool)
        .await
        .unwrap();
}

fn sync_item(id: &str, list_id: &str, name: &str, updated_at: i64) -> SyncItem {
    SyncItem {
        id: id.to_string(),
        list_id: list_id.to_string(),
        name: name.to_string(),
        barcode: None,
        category: Some("Produits frais".to_string()),
        quantity: 1,
        checked: false,
        updated_at,
        deleted_at: None,
    }
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn concurrent_claims_have_exactly_one_owner_and_deletion_blocks_sync() {
    use shopping_list_backend::services::persistent_sync::sync_authorized_items;
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    let list = format!("claim-{}", Uuid::new_v4());
    let first = Uuid::new_v4().to_string();
    let second = Uuid::new_v4().to_string();
    let (a, b) = tokio::join!(
        sync_authorized_items(&pool, &first, &list, &[]),
        sync_authorized_items(&pool, &second, &list, &[]),
    );
    let a = a.unwrap().is_some();
    let b = b.unwrap().is_some();
    assert_ne!(a, b, "only one device may claim the list");
    let owner = if a { &first } else { &second };
    let service = SharingService::default();
    let items = [sync_item(
        &format!("item-{}", Uuid::new_v4()),
        &list,
        "Pain",
        100,
    )];
    let (deletion, edit) = tokio::join!(
        service.delete_list(Some(&pool), &list, owner),
        sync_authorized_items(&pool, owner, &list, &items),
    );
    assert_eq!(deletion.unwrap(), Some(true));
    edit.unwrap();
    assert!(sync_authorized_items(&pool, owner, &list, &[])
        .await
        .unwrap()
        .is_none());
    assert!(load_sync_items(&pool, &list).await.unwrap().is_empty());
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn two_server_instances_return_committed_updates_without_stale_cache() {
    use axum::{body::Body, http::Request};
    use shopping_list_backend::{config::Config, routes::create_router, state::AppState};
    use tower::ServiceExt;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    let mut config = Config::from_env();
    config.database_url = Some(url);
    config.require_device_signatures = false;
    config.enable_sync_endpoint = true;
    config.device_registry_path = std::env::temp_dir()
        .join(format!("registry-{}.json", Uuid::new_v4()))
        .display()
        .to_string();
    let first = create_router(AppState::new(config.clone()));
    config.device_registry_path = std::env::temp_dir()
        .join(format!("registry-{}.json", Uuid::new_v4()))
        .display()
        .to_string();
    let second = create_router(AppState::new(config));
    let owner = Uuid::new_v4().to_string();
    let list = format!("servers-{}", Uuid::new_v4());
    let id = format!("milk-{}", Uuid::new_v4());
    let request = |items: Vec<SyncItem>| {
        Request::builder()
            .method("POST")
            .uri("/api/v1/sync")
            .header("content-type", "application/json")
            .header("x-device-id", &owner)
            .body(Body::from(
                serde_json::json!({"list_id":list,"last_sync":0,"items":items}).to_string(),
            ))
            .unwrap()
    };
    assert_eq!(
        first
            .clone()
            .oneshot(request(vec![sync_item(&id, &list, "Lait", 100)]))
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        second
            .clone()
            .oneshot(request(vec![]))
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        first
            .clone()
            .oneshot(request(vec![sync_item(&id, &list, "Lait modifié", 200)]))
            .await
            .unwrap()
            .status(),
        200
    );
    let response = second
        .clone()
        .oneshot(request(vec![sync_item(&id, &list, "Ancien lait", 150)]))
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["updated_items"][0]["name"], "Lait modifié");
    assert_eq!(body["conflicts"].as_array().unwrap().len(), 1);
    let bread = format!("bread-{}", Uuid::new_v4());
    let (a, b) = tokio::join!(
        first.oneshot(request(vec![sync_item(&id, &list, "Lait frais", 300)])),
        second.oneshot(request(vec![sync_item(&bread, &list, "Pain", 300)])),
    );
    assert_eq!(a.unwrap().status(), 200);
    assert_eq!(b.unwrap().status(), 200);
    let final_items = load_sync_items(&pool, &list).await.unwrap();
    assert_eq!(final_items.len(), 2);
    assert!(final_items.iter().any(|item| item.name == "Lait frais"));
    assert!(final_items.iter().any(|item| item.name == "Pain"));
    let sharing = SharingService::default();
    sharing
        .delete_list(Some(&pool), &list, &owner)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL database"]
async fn shared_names_are_durable_and_atomic_with_items() {
    use shopping_list_backend::{
        handlers::sync::SyncListName, services::persistent_sync::sync_authorized_list,
    };
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    prepare_database(&pool).await.unwrap();
    let owner = Uuid::new_v4().to_string();
    let member = Uuid::new_v4().to_string();
    let stranger = Uuid::new_v4().to_string();
    let list = format!("named-{}", Uuid::new_v4());
    let seed = SyncListName {
        name: "Famille".into(),
        updated_at: 0,
    };
    let sharing = SharingService::default();
    assert!(sync_authorized_list(&pool, &owner, &list, &[], None)
        .await
        .unwrap()
        .is_some());
    let invite = sharing
        .create_invitation(Some(&pool), &list, &owner)
        .await
        .unwrap()
        .unwrap();
    sharing
        .join(Some(&pool), &invite.code, &member)
        .await
        .unwrap();
    // An old joining client cannot bootstrap its placeholder ahead of the owner.
    assert!(
        sync_authorized_list(&pool, &member, &list, &[], Some(&seed))
            .await
            .unwrap()
            .unwrap()
            .1
            .is_none()
    );
    assert_eq!(
        sync_authorized_list(&pool, &owner, &list, &[], Some(&seed))
            .await
            .unwrap()
            .unwrap()
            .1,
        Some(seed)
    );
    let a = SyncListName {
        name: "Alpha".into(),
        updated_at: 100,
    };
    let z = SyncListName {
        name: "Zèbre".into(),
        updated_at: 100,
    };
    let (first, second) = tokio::join!(
        sync_authorized_list(&pool, &owner, &list, &[], Some(&z)),
        sync_authorized_list(&pool, &member, &list, &[], Some(&a)),
    );
    first.unwrap();
    second.unwrap();
    assert_eq!(
        sync_authorized_list(&pool, &owner, &list, &[], None)
            .await
            .unwrap()
            .unwrap()
            .1,
        Some(z.clone())
    );
    assert!(sync_authorized_list(&pool, &stranger, &list, &[], Some(&a))
        .await
        .unwrap()
        .is_none());
    // A failed item write must roll back its accompanying rename.
    let other_list = format!("other-{}", Uuid::new_v4());
    let item_id = Uuid::new_v4().to_string();
    sync_authorized_list(
        &pool,
        &owner,
        &other_list,
        &[sync_item(&item_id, &other_list, "Lait", 1)],
        None,
    )
    .await
    .unwrap();
    let newer = SyncListName {
        name: "Must roll back".into(),
        updated_at: 101,
    };
    assert!(sync_authorized_list(
        &pool,
        &owner,
        &list,
        &[sync_item(&item_id, &list, "Lait", 2)],
        Some(&newer)
    )
    .await
    .is_err());
    pool.close().await;
    let reopened = PgPoolOptions::new()
        .connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    assert_eq!(
        sync_authorized_list(&reopened, &member, &list, &[], None)
            .await
            .unwrap()
            .unwrap()
            .1,
        Some(z)
    );
    sharing
        .remove_member(Some(&reopened), &list, &owner, &member)
        .await
        .unwrap();
    assert!(
        sync_authorized_list(&reopened, &member, &list, &[], Some(&newer))
            .await
            .unwrap()
            .is_none()
    );
    for id in [&list, &other_list] {
        sqlx::query("DELETE FROM shared_lists WHERE id=$1")
            .bind(id)
            .execute(&reopened)
            .await
            .unwrap();
    }
    for id in [&owner, &member, &stranger] {
        sqlx::query("DELETE FROM anonymous_devices WHERE device_id=$1")
            .bind(id)
            .execute(&reopened)
            .await
            .unwrap();
    }
}
