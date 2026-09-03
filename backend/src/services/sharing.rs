use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use sqlx::{PgPool, Row};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct SharingService {
    state: Arc<Mutex<MemorySharingState>>,
}

#[derive(Default)]
struct MemorySharingState {
    owners: HashMap<String, String>,
    members: HashMap<(String, String), &'static str>,
    invitations: HashMap<String, MemoryInvitation>,
}

struct MemoryInvitation {
    list_id: String,
    created_by: String,
    expires_at: i64,
    revoked: bool,
}

pub struct Invitation {
    pub code: String,
    pub list_id: String,
    pub expires_at: i64,
}

pub struct ListMember {
    pub device_id: String,
    pub role: String,
    pub joined_at: i64,
}

impl SharingService {
    pub async fn list_members(
        &self,
        pool: Option<&PgPool>,
        list_id: &str,
        owner_id: &str,
    ) -> Result<Option<Vec<ListMember>>, sqlx::Error> {
        if let Some(pool) = pool {
            let owner =
                sqlx::query("SELECT 1 FROM shared_lists WHERE id = $1 AND owner_device_id = $2")
                    .bind(list_id)
                    .bind(owner_id)
                    .fetch_optional(pool)
                    .await?;
            if owner.is_none() {
                return Ok(None);
            }
            let rows = sqlx::query("SELECT device_id, role, joined_at FROM list_members WHERE list_id = $1 ORDER BY joined_at")
                .bind(list_id).fetch_all(pool).await?;
            return rows
                .into_iter()
                .map(|row| {
                    Ok(ListMember {
                        device_id: row.try_get("device_id")?,
                        role: row.try_get("role")?,
                        joined_at: row.try_get("joined_at")?,
                    })
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Some);
        }
        let state = self.state.lock().await;
        if state
            .owners
            .get(list_id)
            .is_none_or(|owner| owner != owner_id)
        {
            return Ok(None);
        }
        Ok(Some(
            state
                .members
                .iter()
                .filter(|((member_list, _), _)| member_list == list_id)
                .map(|((_, device_id), role)| ListMember {
                    device_id: device_id.clone(),
                    role: (*role).into(),
                    joined_at: 0,
                })
                .collect(),
        ))
    }

    pub async fn remove_member(
        &self,
        pool: Option<&PgPool>,
        list_id: &str,
        owner_id: &str,
        member_id: &str,
    ) -> Result<Option<bool>, sqlx::Error> {
        if let Some(pool) = pool {
            let mut tx = pool.begin().await?;
            let owner_exists =
                sqlx::query("SELECT 1 FROM shared_lists WHERE id = $1 AND owner_device_id = $2")
                    .bind(list_id)
                    .bind(owner_id)
                    .fetch_optional(&mut *tx)
                    .await?
                    .is_some();
            if !owner_exists {
                return Ok(None);
            }
            let result =
                sqlx::query("DELETE FROM list_members WHERE list_id = $1 AND device_id = $2")
                    .bind(list_id)
                    .bind(member_id)
                    .execute(&mut *tx)
                    .await?;
            if result.rows_affected() == 1 {
                sqlx::query(
                    "UPDATE list_invitations SET revoked_at = $1 WHERE list_id = $2 AND revoked_at IS NULL",
                )
                .bind(Utc::now().timestamp_millis())
                .bind(list_id)
                .execute(&mut *tx)
                .await?;
            }
            tx.commit().await?;
            return Ok(Some(result.rows_affected() == 1));
        }
        let mut state = self.state.lock().await;
        if state
            .owners
            .get(list_id)
            .is_none_or(|owner| owner != owner_id)
        {
            return Ok(None);
        }
        let removed = state
            .members
            .remove(&(list_id.to_string(), member_id.to_string()))
            .is_some();
        if removed {
            for invitation in state
                .invitations
                .values_mut()
                .filter(|entry| entry.list_id == list_id)
            {
                invitation.revoked = true;
            }
        }
        Ok(Some(removed))
    }

    pub async fn authorize_or_claim(
        &self,
        pool: Option<&PgPool>,
        list_id: &str,
        device_id: &str,
    ) -> Result<bool, sqlx::Error> {
        if let Some(pool) = pool {
            let access = sqlx::query(
                r#"
                SELECT EXISTS(SELECT 1 FROM shared_lists WHERE id = $1) AS exists,
                       EXISTS(
                           SELECT 1 FROM shared_lists WHERE id = $1 AND owner_device_id = $2
                           UNION ALL
                           SELECT 1 FROM list_members WHERE list_id = $1 AND device_id = $2
                       ) AS allowed
                "#,
            )
            .bind(list_id)
            .bind(device_id)
            .fetch_one(pool)
            .await?;
            let exists: bool = access.try_get("exists")?;
            let allowed: bool = access.try_get("allowed")?;
            return Ok(!exists || allowed);
        }

        let mut state = self.state.lock().await;
        match state.owners.get(list_id) {
            None => {
                state
                    .owners
                    .insert(list_id.to_string(), device_id.to_string());
                Ok(true)
            }
            Some(owner) if owner == device_id => Ok(true),
            Some(_) => Ok(state
                .members
                .contains_key(&(list_id.to_string(), device_id.to_string()))),
        }
    }

    pub async fn create_invitation(
        &self,
        pool: Option<&PgPool>,
        list_id: &str,
        device_id: &str,
    ) -> Result<Option<Invitation>, sqlx::Error> {
        if !self.authorize_or_claim(pool, list_id, device_id).await? {
            return Ok(None);
        }

        let now = Utc::now().timestamp_millis();
        let invitation = Invitation {
            code: Uuid::new_v4().simple().to_string(),
            list_id: list_id.to_string(),
            expires_at: now + 24 * 60 * 60 * 1_000,
        };

        if let Some(pool) = pool {
            let inserted = sqlx::query(
                r#"
                INSERT INTO list_invitations (code, list_id, created_by, created_at, expires_at)
                SELECT $1, $2, $3, $4, $5
                WHERE EXISTS(SELECT 1 FROM shared_lists WHERE id = $2)
                "#,
            )
            .bind(&invitation.code)
            .bind(list_id)
            .bind(device_id)
            .bind(now)
            .bind(invitation.expires_at)
            .execute(pool)
            .await?;
            return Ok((inserted.rows_affected() == 1).then_some(invitation));
        }

        self.state.lock().await.invitations.insert(
            invitation.code.clone(),
            MemoryInvitation {
                list_id: list_id.to_string(),
                created_by: device_id.to_string(),
                expires_at: invitation.expires_at,
                revoked: false,
            },
        );
        Ok(Some(invitation))
    }

    pub async fn join(
        &self,
        pool: Option<&PgPool>,
        code: &str,
        device_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let now = Utc::now().timestamp_millis();
        if let Some(pool) = pool {
            let mut tx = pool.begin().await?;
            let invitation = sqlx::query(
                "SELECT list_id FROM list_invitations WHERE code = $1 AND revoked_at IS NULL AND expires_at > $2",
            )
            .bind(code)
            .bind(now)
            .fetch_optional(&mut *tx)
            .await?;
            let Some(invitation) = invitation else {
                return Ok(None);
            };
            let list_id: String = invitation.try_get("list_id")?;
            sqlx::query(
                "INSERT INTO list_members (list_id, device_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            )
            .bind(&list_id)
            .bind(device_id)
            .bind(now)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            return Ok(Some(list_id));
        }

        let mut state = self.state.lock().await;
        let Some(invitation) = state.invitations.get(code) else {
            return Ok(None);
        };
        if invitation.revoked || invitation.expires_at <= now {
            return Ok(None);
        }
        let list_id = invitation.list_id.clone();
        state
            .members
            .insert((list_id.clone(), device_id.to_string()), "editor");
        Ok(Some(list_id))
    }

    pub async fn revoke(
        &self,
        pool: Option<&PgPool>,
        code: &str,
        device_id: &str,
    ) -> Result<bool, sqlx::Error> {
        if let Some(pool) = pool {
            let result = sqlx::query(
                r#"
                UPDATE list_invitations SET revoked_at = $1
                WHERE code = $2 AND revoked_at IS NULL AND (
                    created_by = $3 OR EXISTS(
                        SELECT 1 FROM shared_lists
                        WHERE id = list_invitations.list_id AND owner_device_id = $3
                    )
                )
                "#,
            )
            .bind(Utc::now().timestamp_millis())
            .bind(code)
            .bind(device_id)
            .execute(pool)
            .await?;
            return Ok(result.rows_affected() == 1);
        }

        let mut state = self.state.lock().await;
        let owner_by_list = state.owners.clone();
        let Some(invitation) = state.invitations.get_mut(code) else {
            return Ok(false);
        };
        let allowed = invitation.created_by == device_id
            || owner_by_list
                .get(&invitation.list_id)
                .is_some_and(|owner| owner == device_id);
        if allowed {
            invitation.revoked = true;
        }
        Ok(allowed)
    }
}
