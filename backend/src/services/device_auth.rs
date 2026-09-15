use sqlx::{PgPool, Row};

use super::secret_cipher::SecretCipher;

pub fn generate_secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

pub async fn enroll(
    pool: &PgPool,
    cipher: &SecretCipher,
    device_id: &str,
) -> Result<Option<String>, String> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, sync_count) VALUES ($1, $2, $2, 0) ON CONFLICT DO NOTHING",
    ).bind(device_id).bind(now).execute(pool).await.map_err(|error| error.to_string())?;
    let secret = generate_secret();
    let stored = cipher.encrypt(&secret).await?;
    let row = sqlx::query(
        "UPDATE anonymous_devices SET auth_secret = $2, last_seen_at = $3 WHERE device_id = $1 AND auth_secret IS NULL RETURNING auth_secret",
    ).bind(device_id).bind(&stored).bind(now).fetch_optional(pool).await.map_err(|error| error.to_string())?;
    Ok(row.map(|_| secret))
}

pub async fn get_secret(
    pool: &PgPool,
    cipher: &SecretCipher,
    device_id: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query("SELECT auth_secret FROM anonymous_devices WHERE device_id = $1")
        .bind(device_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| error.to_string())?;
    let Some(stored) = row.and_then(|value| value.get::<Option<String>, _>("auth_secret")) else {
        return Ok(None);
    };
    let secret = cipher.decrypt(&stored).await?;
    if cipher.needs_rotation(&stored) {
        let rotated = cipher.encrypt(&secret).await?;
        sqlx::query("UPDATE anonymous_devices SET auth_secret = $2 WHERE device_id = $1 AND auth_secret = $3")
            .bind(device_id)
            .bind(rotated)
            .bind(stored)
            .execute(pool)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(Some(secret))
}

pub async fn rotate(
    pool: &PgPool,
    cipher: &SecretCipher,
    device_id: &str,
) -> Result<Option<String>, String> {
    let secret = generate_secret();
    let stored = cipher.encrypt(&secret).await?;
    let result = sqlx::query(
        "UPDATE anonymous_devices SET auth_secret = $2, last_seen_at = $3 WHERE device_id = $1 AND auth_secret IS NOT NULL",
    )
    .bind(device_id)
    .bind(stored)
    .bind(chrono::Utc::now().timestamp_millis())
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok((result.rows_affected() == 1).then_some(secret))
}
