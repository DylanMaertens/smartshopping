//! Application access, not OS connections. Identity is attached only AFTER HMAC
//! verification. Forwarded IPs and unsigned x-device-id are deliberately ignored.
use crate::services::admin::Event;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tokio::sync::Semaphore;
use uuid::Uuid;

#[derive(Clone)]
pub struct VerifiedDevice(pub String);

pub struct AccessJournal {
    slot: Semaphore,
    dropped: AtomicU64,
}
impl Default for AccessJournal {
    fn default() -> Self {
        Self {
            slot: Semaphore::new(4),
            dropped: AtomicU64::new(0),
        }
    }
}
impl AccessJournal {
    pub fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }
    pub async fn record(&self, pool: &PgPool, event: &Event, device: Option<&str>) {
        // Bounded work: no unbounded queue/tasks during a flood or a database outage.
        let Ok(_permit) = self.slot.try_acquire() else {
            self.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        };
        let result = tokio::time::timeout(Duration::from_millis(300), async {
            let mut tx = pool.begin().await?;
            sqlx::query("SET LOCAL statement_timeout = '200ms'").execute(&mut *tx).await?;
            // Serialize pruning across processes; bounded by timeout above.
            sqlx::query("SELECT pg_advisory_xact_lock(731940082)").execute(&mut *tx).await?;
            let now = chrono::Utc::now().timestamp_millis();
            sqlx::query("INSERT INTO access_events (created_at,device_id,reference,route,method,service,status,code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
                .bind(now).bind(device).bind(&event.reference).bind(event.route).bind(event.method)
                .bind(event.service).bind(i32::from(event.status)).bind(event.code).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM access_events WHERE created_at < $1 OR id < (SELECT id FROM access_events ORDER BY id DESC OFFSET 4999 LIMIT 1)")
                .bind(now - 7 * 24 * 60 * 60 * 1000).execute(&mut *tx).await?;
            tx.commit().await
        }).await;
        if !matches!(result, Ok(Ok(()))) {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

pub async fn blocked(pool: &PgPool, device: &str) -> Result<bool, sqlx::Error> {
    // No cache: an administrator's committed decision applies to the next request.
    tokio::time::timeout(Duration::from_secs(2), sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM device_access_blocks WHERE device_id=$1 AND expires_at > $2)")
        .bind(device).bind(chrono::Utc::now().timestamp_millis()).fetch_one(pool))
        .await.map_err(|_| sqlx::Error::PoolTimedOut)?
}

#[derive(Serialize, FromRow)]
pub struct AccessEvent {
    pub created_at: i64,
    pub device_id: Option<String>,
    pub reference: String,
    pub route: String,
    pub method: String,
    pub service: String,
    pub status: i32,
    pub code: String,
}
#[derive(Serialize, FromRow)]
pub struct Block {
    pub device_id: String,
    pub version: Uuid,
    pub expires_at: Option<i64>,
    pub reason: String,
    pub updated_at: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Decision {
    pub device_id: Uuid,
    pub expected_version: Option<Uuid>,
    pub minutes: u32,
    pub reason: String,
}
impl Decision {
    pub fn valid(&self) -> bool {
        [0, 15, 60, 1440].contains(&self.minutes)
            && (10..=500).contains(&self.reason.trim().chars().count())
            && !self.reason.chars().any(char::is_control)
    }
}

/// Row lock serializes decisions; audit and restriction commit atomically.
/// Returns false for a stale snapshot, so another admin's decision is not overwritten.
pub async fn decide(pool: &PgPool, decision: &Decision, actor: &str) -> Result<bool, sqlx::Error> {
    if !decision.valid() {
        return Err(sqlx::Error::Protocol("invalid decision".into()));
    }
    let mut tx = pool.begin().await?;
    sqlx::query("SET LOCAL lock_timeout = '2s'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL statement_timeout = '3s'")
        .execute(&mut *tx)
        .await?;
    let device = decision.device_id.to_string();
    sqlx::query_scalar::<_, String>("SELECT device_id FROM anonymous_devices WHERE device_id=$1 AND auth_secret IS NOT NULL FOR UPDATE")
        .bind(&device).fetch_one(&mut *tx).await?;
    let current: Option<Uuid> =
        sqlx::query_scalar("SELECT version FROM device_access_blocks WHERE device_id=$1")
            .bind(&device)
            .fetch_optional(&mut *tx)
            .await?;
    if current != decision.expected_version {
        return Ok(false);
    }
    let now = chrono::Utc::now().timestamp_millis();
    let expires = (decision.minutes > 0).then_some(now + i64::from(decision.minutes) * 60_000);
    sqlx::query("INSERT INTO device_access_blocks(device_id,version,expires_at,reason,updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(device_id) DO UPDATE SET version=EXCLUDED.version,expires_at=EXCLUDED.expires_at,reason=EXCLUDED.reason,updated_at=EXCLUDED.updated_at")
        .bind(&device).bind(Uuid::new_v4()).bind(expires).bind(decision.reason.trim()).bind(now).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO security_decisions(device_id,actor,expires_at,reason,created_at) VALUES ($1,$2,$3,$4,$5)")
        .bind(&device).bind(actor).bind(expires).bind(decision.reason.trim()).bind(now).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(true)
}
