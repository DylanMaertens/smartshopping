use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Row, Transaction};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
use uuid::Uuid;

use crate::{config::Config, services::categories::STORE_CATEGORIES};

#[derive(Clone, Debug, Serialize)]
pub struct CommunityFieldSuggestion {
    pub proposal_id: Uuid,
    pub field: String,
    pub value: String,
    pub confirmations: i64,
    pub agreement_ratio: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct CommunitySuggestions {
    pub barcode: String,
    pub suggestions: Vec<CommunityFieldSuggestion>,
    pub contributions_enabled: bool,
}

#[derive(Clone, Debug)]
pub struct ValidatedCommunityProduct {
    pub name: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ValidatedCommunityField {
    pub proposal_id: Uuid,
    pub field: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct ValidatedCommunityFields {
    pub barcode: String,
    pub fields: Vec<ValidatedCommunityField>,
    pub contributions_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct ProposalInput {
    pub name: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProposalReceipt {
    pub proposal_ids: Vec<Uuid>,
    pub publication_status: &'static str,
}

pub fn normalize_public_text(value: &str) -> String {
    let folded: String = value
        .nfkd()
        .filter(|character| !is_combining_mark(*character))
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn validate_public_name(value: &str, config: &Config) -> Result<String, &'static str> {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() || value.len() > 200 || value.chars().any(char::is_control) {
        return Err("Le nom public est vide, trop long ou contient des caractères interdits.");
    }
    let normalized = normalize_public_text(&value);
    if normalized.is_empty() {
        return Err("Le nom public doit contenir des lettres ou des chiffres.");
    }
    let mut padded = format!(" {normalized} ");
    // Mask only complete exception occurrences, not other prohibited words in the name.
    for exception in &config.community_prohibited_exceptions {
        let exception = normalize_public_text(exception);
        if !exception.is_empty() {
            padded = padded.replace(&format!(" {exception} "), " | ");
        }
    }
    for term in &config.community_prohibited_terms {
        let term = normalize_public_text(term);
        if term.is_empty() || !padded.contains(&format!(" {term} ")) {
            continue;
        }
        return Err("Ce nom ne peut pas être proposé publiquement.");
    }
    Ok(value)
}

pub fn validate_category(value: &str) -> Result<String, &'static str> {
    let trimmed = value.trim();
    STORE_CATEGORIES
        .iter()
        .find(|category| category.name == trimmed)
        .map(|category| category.name.to_string())
        .ok_or("Le rayon proposé n’appartient pas à la liste des rayons disponibles.")
}

pub async fn validated_product(
    pool: &PgPool,
    barcode: &str,
    config: &Config,
) -> Result<Option<ValidatedCommunityProduct>, sqlx::Error> {
    let fields = validated_fields(pool, barcode, config).await?;
    let name = fields.iter().find(|entry| entry.field == "name");
    let category = fields.iter().find(|entry| entry.field == "category");
    Ok(name.map(|entry| ValidatedCommunityProduct {
        name: entry.value.clone(),
        category: category.map(|entry| entry.value.clone()),
    }))
}

pub async fn validated_fields(
    pool: &PgPool,
    barcode: &str,
    config: &Config,
) -> Result<Vec<ValidatedCommunityField>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT ON (field_name) id, field_name, value
        FROM community_product_proposals proposal
        WHERE barcode = $1 AND status = 'validated'
          AND (SELECT COUNT(*) FROM community_active_votes v WHERE v.proposal_id=proposal.id AND v.agrees) >= $2
          AND (SELECT COUNT(*)::FLOAT8 FROM community_active_votes v WHERE v.proposal_id=proposal.id AND v.agrees)
            / NULLIF((SELECT COUNT(DISTINCT v.device_id) FROM community_active_votes v WHERE v.barcode=proposal.barcode AND v.field_name=proposal.field_name),0) >= $3
          AND NOT EXISTS (
            SELECT 1 FROM community_contributor_restrictions restriction
            WHERE restriction.device_id = proposal.contributor_device_id
              AND restriction.lifted_at IS NULL
              AND restriction.starts_at <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
              AND (restriction.ends_at IS NULL OR restriction.ends_at > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
          )
        ORDER BY field_name, updated_at DESC, id
        "#,
    )
    .bind(barcode)
    .bind(i64::from(config.community_consensus_min_devices))
    .bind(config.community_consensus_ratio)
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(ValidatedCommunityField {
                proposal_id: row.try_get("id")?,
                field: row.try_get("field_name")?,
                value: row.try_get("value")?,
            })
        })
        .collect()
}

pub async fn suggestions(
    pool: &PgPool,
    barcode: &str,
) -> Result<CommunitySuggestions, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT proposal.id, proposal.field_name, proposal.value,
               COUNT(confirmation.device_id) FILTER (WHERE confirmation.agrees) AS agrees,
               (SELECT COUNT(DISTINCT v.device_id) FROM community_active_votes v
                 WHERE v.barcode=proposal.barcode AND v.field_name=proposal.field_name) AS total
        FROM community_product_proposals proposal
        LEFT JOIN community_proposal_confirmations confirmation
          ON confirmation.proposal_id = proposal.id
          AND NOT EXISTS (
            SELECT 1 FROM community_contributor_restrictions voter_restriction
            WHERE voter_restriction.device_id = confirmation.device_id
              AND voter_restriction.lifted_at IS NULL
              AND voter_restriction.starts_at <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
              AND (voter_restriction.ends_at IS NULL OR voter_restriction.ends_at > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
          )
        WHERE proposal.barcode = $1 AND proposal.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM community_contributor_restrictions contributor_restriction
            WHERE contributor_restriction.device_id = proposal.contributor_device_id
              AND contributor_restriction.lifted_at IS NULL
              AND contributor_restriction.starts_at <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
              AND (contributor_restriction.ends_at IS NULL OR contributor_restriction.ends_at > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
          )
        GROUP BY proposal.id
        ORDER BY agrees DESC, total DESC, proposal.updated_at DESC, proposal.id
        LIMIT 3
        "#,
    )
    .bind(barcode)
    .fetch_all(pool)
    .await?;
    let suggestions = rows
        .into_iter()
        .map(|row| {
            let confirmations = row.try_get::<i64, _>("agrees")?;
            let total = row.try_get::<i64, _>("total")?;
            Ok(CommunityFieldSuggestion {
                proposal_id: row.try_get("id")?,
                field: row.try_get("field_name")?,
                value: row.try_get("value")?,
                confirmations,
                agreement_ratio: if total == 0 {
                    0.0
                } else {
                    confirmations as f64 / total as f64
                },
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    Ok(CommunitySuggestions {
        barcode: barcode.to_owned(),
        suggestions,
        contributions_enabled: false, // Set by the authenticated HTTP capability gate.
    })
}

pub async fn submit_proposals(
    pool: &PgPool,
    barcode: &str,
    device_id: &str,
    input: ProposalInput,
    config: &Config,
) -> Result<ProposalReceipt, SubmitError> {
    let mut values = Vec::new();
    if let Some(name) = input.name {
        values.push((
            "name",
            validate_public_name(&name, config).map_err(SubmitError::Validation)?,
        ));
    }
    if let Some(category) = input.category {
        values.push((
            "category",
            validate_category(&category).map_err(SubmitError::Validation)?,
        ));
    }
    if values.is_empty() {
        return Err(SubmitError::Validation(
            "Propose un nom, un rayon, ou les deux.",
        ));
    }
    let now = chrono::Utc::now().timestamp_millis();
    let mut transaction = pool.begin().await?;
    lock_contribution(&mut transaction, device_id, barcode).await?;
    if restricted(&mut transaction, device_id, now).await? {
        return Ok(ProposalReceipt {
            proposal_ids: vec![],
            publication_status: "received",
        });
    }
    claim_write(&mut transaction, device_id, now).await?;
    let mut ids = Vec::with_capacity(values.len());
    for (field, value) in values {
        let id = Uuid::new_v4();
        let normalized = normalize_public_text(&value);
        let row = sqlx::query(
            r#"
            INSERT INTO community_product_proposals
                (id, barcode, field_name, value, normalized_value, contributor_device_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            ON CONFLICT (barcode, field_name, normalized_value)
                WHERE status IN ('pending', 'validated')
            DO UPDATE SET updated_at = community_product_proposals.updated_at
            RETURNING id
            "#,
        )
        .bind(id)
        .bind(barcode)
        .bind(field)
        .bind(value)
        .bind(normalized)
        .bind(device_id)
        .bind(now)
        .fetch_one(&mut *transaction)
        .await?;
        let proposal_id: Uuid = row.try_get("id")?;
        upsert_confirmation(&mut transaction, proposal_id, device_id, true, now).await?;
        refresh_product(&mut transaction, barcode, config).await?;
        ids.push(proposal_id);
    }
    transaction.commit().await?;
    Ok(ProposalReceipt {
        proposal_ids: ids,
        publication_status: "received",
    })
}

pub async fn confirm(
    pool: &PgPool,
    proposal_id: Uuid,
    device_id: &str,
    agrees: bool,
    config: &Config,
) -> Result<bool, SubmitError> {
    let now = chrono::Utc::now().timestamp_millis();
    let mut transaction = pool.begin().await?;
    let barcode = sqlx::query_scalar::<_, String>(
        "SELECT barcode FROM community_product_proposals WHERE id = $1 AND status IN ('pending', 'validated')",
    )
    .bind(proposal_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let Some(barcode) = barcode else {
        return Ok(false);
    };
    lock_contribution(&mut transaction, device_id, &barcode).await?;
    if restricted(&mut transaction, device_id, now).await? {
        return Ok(true);
    }
    // Recheck after acquiring the product lock (including moderation changes).
    let active = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM community_product_proposals WHERE id=$1 AND status IN ('pending','validated'))")
        .bind(proposal_id).fetch_one(&mut *transaction).await?;
    if !active {
        return Ok(false);
    }
    claim_write(&mut transaction, device_id, now).await?;
    upsert_confirmation(&mut transaction, proposal_id, device_id, agrees, now).await?;
    refresh_product(&mut transaction, &barcode, config).await?;
    transaction.commit().await?;
    Ok(true)
}

pub async fn report(
    pool: &PgPool,
    proposal_id: Uuid,
    device_id: &str,
    reason: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let id = Uuid::new_v4();
    let row = sqlx::query(
        r#"
        INSERT INTO community_proposal_reports
            (id, proposal_id, reporter_device_id, reason, created_at)
        SELECT $1, id, $2, $3, $4 FROM community_product_proposals WHERE id = $5
        ON CONFLICT (proposal_id, reporter_device_id, reason)
        DO UPDATE SET proposal_id = community_proposal_reports.proposal_id
        RETURNING id
        "#,
    )
    .bind(id)
    .bind(device_id)
    .bind(reason)
    .bind(chrono::Utc::now().timestamp_millis())
    .bind(proposal_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| row.get("id")))
}

async fn upsert_confirmation(
    transaction: &mut Transaction<'_, Postgres>,
    proposal_id: Uuid,
    device_id: &str,
    agrees: bool,
    now: i64,
) -> Result<(), sqlx::Error> {
    // An installation can support only one value per product/field. Changing choice
    // retracts its previous support; it cannot inflate competing candidates.
    if agrees {
        sqlx::query(
            r#"UPDATE community_proposal_confirmations c SET agrees=false, updated_at=$3
            FROM community_product_proposals p, community_product_proposals selected
            WHERE selected.id=$1 AND p.barcode=selected.barcode AND p.field_name=selected.field_name
              AND c.proposal_id=p.id AND p.id<>$1 AND c.device_id=$2 AND c.agrees"#,
        )
        .bind(proposal_id)
        .bind(device_id)
        .bind(now)
        .execute(&mut **transaction)
        .await?;
    }
    sqlx::query(
        r#"
        INSERT INTO community_proposal_confirmations
            (proposal_id, device_id, agrees, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (proposal_id, device_id)
        DO UPDATE SET agrees = EXCLUDED.agrees, updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(proposal_id)
    .bind(device_id)
    .bind(agrees)
    .bind(now)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn refresh_consensus(
    transaction: &mut Transaction<'_, Postgres>,
    proposal_id: Uuid,
    config: &Config,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT COUNT(DISTINCT confirmation.device_id) FILTER (WHERE confirmation.proposal_id=$1 AND confirmation.agrees) AS agrees,
               COUNT(DISTINCT confirmation.device_id) AS total
        FROM community_proposal_confirmations confirmation
        JOIN community_product_proposals candidate ON candidate.id=confirmation.proposal_id
        JOIN community_product_proposals selected ON selected.id=$1
        WHERE candidate.barcode=selected.barcode AND candidate.field_name=selected.field_name
          AND candidate.status IN ('pending','validated')
          AND NOT EXISTS (
            SELECT 1 FROM community_contributor_restrictions restriction
            WHERE restriction.device_id = confirmation.device_id
              AND restriction.lifted_at IS NULL
              AND restriction.starts_at <= $2
              AND (restriction.ends_at IS NULL OR restriction.ends_at > $2)
          )
        "#,
    )
    .bind(proposal_id)
    .bind(chrono::Utc::now().timestamp_millis())
    .fetch_one(&mut **transaction)
    .await?;
    let agrees: i64 = row.try_get("agrees")?;
    let total: i64 = row.try_get("total")?;
    let accepted = agrees >= i64::from(config.community_consensus_min_devices)
        && agrees as f64 / total as f64 >= config.community_consensus_ratio;
    sqlx::query("UPDATE community_product_proposals SET status = $3, updated_at = $2 WHERE id = $1 AND status IN ('pending','validated')")
            .bind(proposal_id)
            .bind(chrono::Utc::now().timestamp_millis())
            .bind(if accepted { "validated" } else { "pending" })
            .execute(&mut **transaction)
            .await?;
    Ok(())
}

async fn refresh_product(
    tx: &mut Transaction<'_, Postgres>,
    barcode: &str,
    config: &Config,
) -> Result<(), sqlx::Error> {
    let ids = sqlx::query_scalar::<_, Uuid>("SELECT id FROM community_product_proposals WHERE barcode=$1 AND status IN ('pending','validated')")
        .bind(barcode).fetch_all(&mut **tx).await?;
    for id in ids {
        refresh_consensus(tx, id, config).await?;
    }
    Ok(())
}

async fn lock_contribution(
    tx: &mut Transaction<'_, Postgres>,
    device: &str,
    barcode: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("SET LOCAL lock_timeout = '3s'")
        .execute(&mut **tx)
        .await?;
    sqlx::query("SET LOCAL statement_timeout = '5s'")
        .execute(&mut **tx)
        .await?;
    for key in [
        format!("community-device:{device}"),
        format!("community-product:{barcode}"),
    ] {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(key)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

async fn restricted(
    tx: &mut Transaction<'_, Postgres>,
    device: &str,
    now: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM community_contributor_restrictions WHERE device_id=$1 AND lifted_at IS NULL AND starts_at <= $2 AND (ends_at IS NULL OR ends_at > $2))")
        .bind(device).bind(now).fetch_one(&mut **tx).await
}

async fn claim_write(
    tx: &mut Transaction<'_, Postgres>,
    device: &str,
    now: i64,
) -> Result<(), SubmitError> {
    let count = sqlx::query_scalar::<_, i32>(r#"INSERT INTO community_daily_writes(device_id, day, writes) VALUES($1,$2,1)
        ON CONFLICT(device_id) DO UPDATE SET day=EXCLUDED.day,
          writes=CASE WHEN community_daily_writes.day=EXCLUDED.day THEN community_daily_writes.writes+1 ELSE 1 END
        RETURNING writes"#).bind(device).bind(now / 86_400_000).fetch_one(&mut **tx).await?;
    if count > 100 {
        return Err(SubmitError::Quota);
    }
    Ok(())
}

#[derive(Debug)]
pub enum SubmitError {
    Quota,
    Validation(&'static str),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for SubmitError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        let mut config = Config::from_env();
        config.community_prohibited_terms = vec!["pub".into(), "gros mot".into()];
        config.community_prohibited_exceptions = vec!["pub alimentaire".into()];
        config
    }

    #[test]
    fn public_filter_normalizes_accents_spaces_and_whole_expressions() {
        let config = config();
        assert!(validate_public_name("  Crème   dessert ", &config).is_ok());
        assert!(validate_public_name("Produit avec GROS-môt", &config).is_err());
        assert!(validate_public_name("publication maison", &config).is_ok());
        assert!(validate_public_name("Pub alimentaire locale", &config).is_ok());
        assert!(validate_public_name("Pub locale", &config).is_err());
        assert!(validate_public_name("Pub alimentaire et pub locale", &config).is_err());
        assert!(validate_public_name("Pub alimentairement", &config).is_err());
        assert!(validate_public_name("!!!", &config).is_err());
    }

    #[test]
    fn private_names_are_not_processed_and_public_categories_are_canonical() {
        assert_eq!(validate_category("Boissons").unwrap(), "Boissons");
        assert!(validate_category("Rayon inventé").is_err());
    }
}
