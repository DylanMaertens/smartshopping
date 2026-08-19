use sqlx::{PgPool, Row};

use crate::handlers::sync::SyncItem;

pub async fn load_sync_items(pool: &PgPool, list_id: &str) -> Result<Vec<SyncItem>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, list_id, name, barcode, category, quantity, checked, updated_at, deleted_at
        FROM shared_items
        WHERE list_id = $1
        ORDER BY updated_at ASC
        "#,
    )
    .bind(list_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(SyncItem {
                id: row.try_get("id")?,
                list_id: row.try_get("list_id")?,
                name: row.try_get("name")?,
                barcode: row.try_get("barcode")?,
                category: row.try_get("category")?,
                quantity: row.try_get("quantity")?,
                checked: row.try_get("checked")?,
                updated_at: row.try_get("updated_at")?,
                deleted_at: row.try_get("deleted_at")?,
            })
        })
        .collect()
}

pub async fn persist_sync_items(
    pool: &PgPool,
    device_id: &str,
    list_id: &str,
    items: &[SyncItem],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        r#"
        INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, sync_count)
        VALUES ($1, $2, $2, 1)
        ON CONFLICT (device_id)
        DO UPDATE SET
            last_seen_at = EXCLUDED.last_seen_at,
            sync_count = anonymous_devices.sync_count + 1
        "#,
    )
    .bind(device_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO shared_lists (id, owner_device_id, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET updated_at = GREATEST(shared_lists.updated_at, EXCLUDED.updated_at)
        "#,
    )
    .bind(list_id)
    .bind(device_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO shared_items (
                id, list_id, name, barcode, category, quantity, checked, updated_at, deleted_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id)
            DO UPDATE SET
                list_id = EXCLUDED.list_id,
                name = EXCLUDED.name,
                barcode = EXCLUDED.barcode,
                category = EXCLUDED.category,
                quantity = EXCLUDED.quantity,
                checked = EXCLUDED.checked,
                updated_at = EXCLUDED.updated_at,
                deleted_at = EXCLUDED.deleted_at
            WHERE shared_items.list_id = EXCLUDED.list_id
              AND shared_items.updated_at <= EXCLUDED.updated_at
            "#,
        )
        .bind(&item.id)
        .bind(&item.list_id)
        .bind(&item.name)
        .bind(&item.barcode)
        .bind(&item.category)
        .bind(item.quantity)
        .bind(item.checked)
        .bind(item.updated_at)
        .bind(item.deleted_at)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await
}
