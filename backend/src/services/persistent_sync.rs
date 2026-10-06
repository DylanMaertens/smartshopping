use sqlx::{PgPool, Row};

use crate::handlers::sync::{SyncItem, SyncListName};

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

    upsert_items(&mut tx, items).await?;

    tx.commit().await
}

async fn upsert_items(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    items: &[SyncItem],
) -> Result<(), sqlx::Error> {
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
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub(crate) async fn lock_list(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    list_id: &str,
) -> Result<(), sqlx::Error> {
    // The same transaction-scoped lock protects initial claims, edits, deletion
    // and revocation across server processes. Hash collisions only serialize work.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(list_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn sync_authorized_items(
    pool: &PgPool,
    device_id: &str,
    list_id: &str,
    items: &[SyncItem],
) -> Result<Option<Vec<SyncItem>>, sqlx::Error> {
    Ok(sync_authorized_list(pool, device_id, list_id, items, None)
        .await?
        .map(|(items, _)| items))
}

pub async fn sync_authorized_list(
    pool: &PgPool,
    device_id: &str,
    list_id: &str,
    items: &[SyncItem],
    incoming_name: Option<&SyncListName>,
) -> Result<Option<(Vec<SyncItem>, Option<SyncListName>)>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    lock_list(&mut tx, list_id).await?;
    if sqlx::query("SELECT 1 FROM deleted_lists WHERE id = $1")
        .bind(list_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        return Ok(None);
    }
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, sync_count) VALUES ($1,$2,$2,1) ON CONFLICT (device_id) DO UPDATE SET last_seen_at=$2, sync_count=anonymous_devices.sync_count+1")
        .bind(device_id).bind(now).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO shared_lists (id, owner_device_id, updated_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING")
        .bind(list_id).bind(device_id).bind(now).execute(&mut *tx).await?;
    let allowed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM shared_lists WHERE id=$1 AND owner_device_id=$2 UNION ALL SELECT 1 FROM list_members WHERE list_id=$1 AND device_id=$2)")
        .bind(list_id).bind(device_id).fetch_one(&mut *tx).await?;
    if !allowed {
        return Ok(None);
    }
    let row =
        sqlx::query("SELECT name, name_updated_at, owner_device_id FROM shared_lists WHERE id=$1")
            .bind(list_id)
            .fetch_one(&mut *tx)
            .await?;
    let mut list_name = row
        .try_get::<Option<String>, _>("name")?
        .map(|name| SyncListName {
            name,
            updated_at: row.get("name_updated_at"),
        });
    if let Some(incoming) = incoming_name {
        if incoming.replaces(
            list_name.as_ref(),
            row.get::<String, _>("owner_device_id") == device_id,
        ) {
            sqlx::query("UPDATE shared_lists SET name=$2, name_updated_at=$3 WHERE id=$1")
                .bind(list_id)
                .bind(&incoming.name)
                .bind(incoming.updated_at)
                .execute(&mut *tx)
                .await?;
            list_name = Some(incoming.clone());
        }
    }
    upsert_items(&mut tx, items).await?;
    sqlx::query("UPDATE shared_lists SET updated_at=GREATEST(updated_at,$2) WHERE id=$1")
        .bind(list_id)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    let rows = sqlx::query("SELECT id,list_id,name,barcode,category,quantity,checked,updated_at,deleted_at FROM shared_items WHERE list_id=$1 ORDER BY updated_at,id")
        .bind(list_id).fetch_all(&mut *tx).await?;
    let current = rows
        .into_iter()
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
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    // A global item-ID collision must not acknowledge an unpersisted edit.
    if items
        .iter()
        .any(|item| !current.iter().any(|stored| stored.id == item.id))
    {
        return Err(sqlx::Error::Protocol(
            "item identifier belongs to another list".into(),
        ));
    }
    tx.commit().await?;
    Ok(Some((current, list_name)))
}
