use shopping_list_backend::{
    db::prepare_database,
    handlers::sync::SyncItem,
    services::persistent_sync::{load_sync_items, persist_sync_items},
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
