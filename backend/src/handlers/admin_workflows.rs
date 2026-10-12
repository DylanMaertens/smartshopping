//! Private queues. All routes are mounted under the admin session/origin/CSRF guard.
use crate::{error::ApiError, services::community_catalog, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

pub(crate) fn unavailable(_: impl std::fmt::Debug) -> ApiError {
    ApiError {
        status: StatusCode::SERVICE_UNAVAILABLE,
        code: "WORKFLOW_UNAVAILABLE",
        message: "Base de données indisponible. Aucune action confirmée.".into(),
    }
}
pub(crate) fn database(state: &AppState) -> Result<&PgPool, ApiError> {
    state.db_pool.as_ref().ok_or_else(|| unavailable(()))
}
fn stale() -> ApiError {
    ApiError {
        status: StatusCode::CONFLICT,
        code: "WORKFLOW_STALE",
        message: "Ce dossier a changé. Actualisez avant de décider.".into(),
    }
}
// These projections deliberately omit device identifiers and contact bodies from queues.
fn projection(kind: &str) -> Result<&'static str, ApiError> {
    match kind {
        "proposals" => Ok("SELECT p.id, p.status, p.barcode, p.field_name, p.value, p.created_at, p.updated_at AS version, (SELECT count(*) FROM community_active_votes v WHERE v.proposal_id=p.id AND v.agrees) AS agrees, (SELECT count(*) FROM community_proposal_reports r WHERE r.proposal_id=p.id AND r.status='pending') AS reports FROM community_product_proposals p"),
        "reports" => Ok("SELECT r.id, r.status, r.reason, r.created_at, coalesce(r.reviewed_at,0) AS version, p.id AS proposal_id, p.barcode, p.field_name, p.value, p.status AS proposal_status, p.updated_at AS proposal_version FROM community_proposal_reports r JOIN community_product_proposals p ON p.id=r.proposal_id"),
        "messages" => Ok("SELECT id, status, email, topic, created_at, revision AS version FROM contact_messages"),
        _ => Err(ApiError::not_found("File inconnue")),
    }
}
fn statuses(kind: &str) -> &'static [&'static str] {
    match kind {
        "proposals" => &["pending", "validated", "rejected", "revoked"],
        "reports" => &["pending", "upheld", "dismissed"],
        "messages" => &["new", "active", "closed"],
        _ => &[],
    }
}
#[derive(Deserialize, Default)]
pub struct QueueQuery {
    status: Option<String>,
    #[serde(default)]
    search: String,
    #[serde(default)]
    offset: u32,
}
pub async fn queue(
    State(state): State<AppState>,
    Path(kind): Path<String>,
    Query(q): Query<QueueQuery>,
) -> Result<Json<Value>, ApiError> {
    let select = projection(&kind)?;
    let status = q.status.as_deref().unwrap_or(statuses(&kind)[0]);
    let search = q.search.trim();
    if !statuses(&kind).contains(&status)
        || q.offset > 100_000
        || search.chars().count() > 120
        || search.chars().any(char::is_control)
    {
        return Err(ApiError::bad_request("Filtre invalide"));
    }
    let pool = database(&state)?;
    // Literal substring matching, not LIKE: %, _ and quotes are ordinary input.
    let fields = if kind == "messages" {
        "concat_ws(' ',id::text,email,topic,CASE topic WHEN 'question' THEN 'Question sur l’application' WHEN 'technical' THEN 'Problème technique' WHEN 'suggestion' THEN 'Suggestion d’amélioration' ELSE 'Autre demande' END)"
    } else {
        "concat_ws(' ',id::text,barcode,value)"
    };
    let sql = format!("WITH matches AS NOT MATERIALIZED (SELECT * FROM ({select}) q WHERE status=$1 AND ($2='' OR strpos(lower({fields}),lower($2))>0)) SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),'items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM (SELECT * FROM matches ORDER BY created_at DESC,id LIMIT 51 OFFSET $3) page),'[]'::jsonb))");
    let result: Value = sqlx::query_scalar(&sql)
        .bind(status)
        .bind(search)
        .bind(i64::from(q.offset))
        .fetch_one(pool)
        .await
        .map_err(unavailable)?;
    let mut items = result["items"].as_array().cloned().unwrap_or_default();
    let has_more = items.len() > 50;
    items.truncate(50);
    Ok(Json(
        json!({"items":items,"total":result["total"],"has_more":has_more,"offset":q.offset,"community_enabled":state.config.enable_community_catalog,"contact_enabled":state.contact_enabled}),
    ))
}
pub async fn counts(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let result: Value = sqlx::query_scalar("SELECT jsonb_build_object('proposals',(SELECT count(*) FROM community_product_proposals WHERE status='pending'),'reports',(SELECT count(*) FROM community_proposal_reports WHERE status='pending'),'messages',(SELECT count(*) FROM contact_messages WHERE status='new'),'active_messages',(SELECT count(*) FROM contact_messages WHERE status='active'))")
        .fetch_one(database(&state)?).await.map_err(unavailable)?;
    Ok(Json(result))
}
pub async fn detail(
    State(state): State<AppState>,
    Path((kind, id)): Path<(String, Uuid)>,
) -> Result<Json<Value>, ApiError> {
    let select = projection(&kind)?;
    let pool = database(&state)?;
    let sql = format!("SELECT to_jsonb(q) FROM ({select}) q WHERE id=$1");
    let mut item: Value = sqlx::query_scalar(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Dossier introuvable"))?;
    if kind == "messages" {
        item["body"] =
            sqlx::query_scalar::<_, String>("SELECT body FROM contact_messages WHERE id=$1")
                .bind(id)
                .fetch_one(pool)
                .await
                .map_err(unavailable)?
                .into();
    }
    let related: Vec<Value> = if kind != "messages" {
        sqlx::query_scalar("SELECT to_jsonb(q) FROM (SELECT p.id,p.field_name,p.value,p.status, (SELECT count(*) FROM community_active_votes v WHERE v.proposal_id=p.id AND v.agrees) AS agrees, (SELECT count(DISTINCT v.device_id) FROM community_active_votes v WHERE v.barcode=p.barcode AND v.field_name=p.field_name) AS total_voters FROM community_product_proposals p WHERE barcode=$1 AND status IN ('pending','validated') ORDER BY field_name,created_at DESC,id LIMIT 20) q")
            .bind(item["barcode"].as_str().unwrap_or_default()).fetch_all(pool).await.map_err(unavailable)?
    } else {
        Vec::new()
    };
    let history: Vec<Value> = sqlx::query_scalar("SELECT to_jsonb(a) FROM (SELECT actor, action, previous_status, next_status, reason, created_at FROM admin_decisions WHERE subject_kind=$1 AND subject_id=$2 ORDER BY id DESC LIMIT 50) a")
        .bind(&kind).bind(id).fetch_all(pool).await.map_err(unavailable)?;
    Ok(Json(
        json!({"item":item,"history":history,"related":related}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Decision {
    pub action: String,
    pub reason: String,
    pub version: i64,
    pub status: String,
    pub proposal_version: Option<i64>,
}
pub(crate) async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    kind: &str,
    id: Uuid,
    actor: &str,
    action: &str,
    old: &str,
    new: &str,
    reason: &str,
    now: i64,
) -> Result<(), ApiError> {
    sqlx::query("INSERT INTO admin_decisions(subject_kind,subject_id,actor,action,previous_status,next_status,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(kind).bind(id).bind(actor).bind(action).bind(old).bind(new).bind(reason).bind(now).execute(&mut **tx).await.map_err(unavailable)?;
    Ok(())
}
pub async fn decide(
    State(state): State<AppState>,
    Path((kind, id)): Path<(String, Uuid)>,
    Json(input): Json<Decision>,
) -> Result<Json<Value>, ApiError> {
    projection(&kind)?;
    let reason = input.reason.trim();
    if !(10..=1000).contains(&reason.chars().count())
        || reason
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(ApiError::bad_request(
            "Motif requis : 10 à 1 000 caractères",
        ));
    }
    let actor = state
        .admin
        .operator()
        .ok_or_else(|| ApiError::forbidden("Session requise"))?;
    let mut tx = database(&state)?.begin().await.map_err(unavailable)?;
    sqlx::query("SET LOCAL lock_timeout = '3s'")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    sqlx::query("SET LOCAL statement_timeout = '5s'")
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
    let now = chrono::Utc::now().timestamp_millis();
    let mut invalidated = None;
    let new_status;
    if kind == "messages" {
        if !statuses(&kind).contains(&input.action.as_str()) || input.action == input.status {
            return Err(ApiError::bad_request("Transition invalide"));
        }
        let updated = sqlx::query("UPDATE contact_messages SET status=$2, revision=revision+1, updated_at=$3 WHERE id=$1 AND status=$4 AND revision=$5")
            .bind(id).bind(&input.action).bind(now).bind(&input.status).bind(input.version).execute(&mut *tx).await.map_err(unavailable)?;
        if updated.rows_affected() != 1 {
            return Err(stale());
        }
        new_status = input.action.clone();
    } else {
        // Same advisory lock as signed community contributions, before taking row locks.
        let lookup = if kind == "proposals" {
            "SELECT barcode FROM community_product_proposals WHERE id=$1"
        } else {
            "SELECT p.barcode FROM community_proposal_reports r JOIN community_product_proposals p ON p.id=r.proposal_id WHERE r.id=$1"
        };
        let barcode: String = sqlx::query_scalar(lookup)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(unavailable)?
            .ok_or_else(|| ApiError::not_found("Dossier introuvable"))?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("community-product:{barcode}"))
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let proposal_id = if kind == "reports" {
            let row = sqlx::query("SELECT proposal_id,status,coalesce(reviewed_at,0) AS version FROM community_proposal_reports WHERE id=$1 FOR UPDATE").bind(id).fetch_one(&mut *tx).await.map_err(unavailable)?;
            if row.get::<String, _>("status") != input.status
                || input.status != "pending"
                || row.get::<i64, _>("version") != input.version
            {
                return Err(stale());
            }
            row.get::<Uuid, _>("proposal_id")
        } else {
            id
        };
        let row = sqlx::query(
            "SELECT status,updated_at FROM community_product_proposals WHERE id=$1 FOR UPDATE",
        )
        .bind(proposal_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        let old: String = row.get("status");
        let version: i64 = row.get("updated_at");
        let withdraw = if kind == "proposals" {
            if input.status != old || input.version != version {
                return Err(stale());
            }
            if input.action != "withdraw" {
                return Err(ApiError::bad_request("Action inconnue"));
            }
            true
        } else {
            if input.proposal_version != Some(version) {
                return Err(stale());
            }
            if !["dismiss", "uphold", "withdraw"].contains(&input.action.as_str()) {
                return Err(ApiError::bad_request("Action inconnue"));
            }
            input.action == "withdraw"
        };
        let withdrawn = if old == "pending" {
            "rejected"
        } else {
            "revoked"
        };
        if withdraw {
            if !["pending", "validated"].contains(&old.as_str()) {
                return Err(stale());
            }
            sqlx::query(
                "UPDATE community_product_proposals SET status=$2,updated_at=$3 WHERE id=$1",
            )
            .bind(proposal_id)
            .bind(withdrawn)
            .bind(now.max(version + 1))
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
            if kind == "reports" {
                audit(
                    &mut tx,
                    "proposals",
                    proposal_id,
                    actor,
                    "withdraw",
                    &old,
                    withdrawn,
                    reason,
                    now,
                )
                .await?;
            }
            community_catalog::refresh_product(&mut tx, &barcode, &state.config)
                .await
                .map_err(unavailable)?;
            invalidated = Some(barcode);
        }
        if kind == "reports" {
            new_status = if input.action == "dismiss" {
                "dismissed"
            } else {
                "upheld"
            }
            .to_owned();
            sqlx::query("UPDATE community_proposal_reports SET status=$2,reviewed_at=$3,reviewed_by=$4 WHERE id=$1")
                .bind(id).bind(&new_status).bind(now).bind(actor).execute(&mut *tx).await.map_err(unavailable)?;
        } else {
            new_status = withdrawn.into();
        }
    }
    audit(
        &mut tx,
        &kind,
        id,
        actor,
        &input.action,
        &input.status,
        &new_status,
        reason,
        now,
    )
    .await?;
    tx.commit().await.map_err(unavailable)?;
    if let Some(barcode) = invalidated {
        state.products_cache.invalidate(&barcode).await;
        if let Some(redis) = &state.redis_cache {
            // DB remains authoritative: product lookups revalidate community cache hits.
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(1),
                redis.invalidate_product(&barcode),
            )
            .await;
        }
    }
    Ok(Json(json!({"status":new_status,"saved":true})))
}
