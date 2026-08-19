use sqlx::{PgPool, Row};

pub fn generate_secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

pub async fn enroll(pool: &PgPool, device_id: &str) -> Result<Option<String>, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, sync_count) VALUES ($1, $2, $2, 0) ON CONFLICT DO NOTHING",
    ).bind(device_id).bind(now).execute(pool).await?;
    let secret = generate_secret();
    let row = sqlx::query(
        "UPDATE anonymous_devices SET auth_secret = $2, last_seen_at = $3 WHERE device_id = $1 AND auth_secret IS NULL RETURNING auth_secret",
    ).bind(device_id).bind(&secret).bind(now).fetch_optional(pool).await?;
    Ok(row.map(|value| value.get::<String, _>("auth_secret")))
}

pub async fn get_secret(pool: &PgPool, device_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query("SELECT auth_secret FROM anonymous_devices WHERE device_id = $1")
        .bind(device_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|value| value.get::<Option<String>, _>("auth_secret")))
}
