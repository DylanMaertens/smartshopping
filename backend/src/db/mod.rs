use std::time::Duration;

use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn prepare_database(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub async fn verify_schema(pool: &PgPool) -> Result<(), sqlx::Error> {
    for migration in sqlx::migrate!("./migrations").iter() {
        let checksum: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT checksum FROM _sqlx_migrations WHERE version=$1 AND success",
        )
        .bind(migration.version)
        .fetch_optional(pool)
        .await?;
        if checksum.as_deref() != Some(migration.checksum.as_ref()) {
            return Err(sqlx::Error::Protocol(
                "missing or modified database migration".into(),
            ));
        }
    }
    Ok(())
}

/// Fail closed on a privileged runtime account. This complements, not replaces,
/// network isolation and a reviewed grant list for each schema change.
pub async fn verify_runtime_role(pool: &PgPool) -> Result<(), sqlx::Error> {
    let unsafe_role: bool = sqlx::query_scalar("SELECT
        EXISTS (SELECT 1 FROM pg_roles WHERE pg_has_role(current_user,oid,'MEMBER') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
        OR has_schema_privilege(current_user, 'public', 'CREATE')
        OR has_database_privilege(current_user, current_database(), 'CREATE')
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))
        OR has_table_privilege(current_user,'public.admin_decisions','UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege(current_user,'public.security_decisions','UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege(current_user,'public._sqlx_migrations','INSERT,UPDATE,DELETE,TRUNCATE')")
        .fetch_one(pool).await?;
    if unsafe_role {
        return Err(sqlx::Error::Protocol(
            "privileged runtime role rejected".into(),
        ));
    }
    Ok(())
}

pub fn create_optional_pool(database_url: Option<&str>) -> Option<PgPool> {
    database_url.and_then(|url| {
        match PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect_lazy(url)
        {
            Ok(pool) => Some(pool),
            Err(error) => {
                tracing::warn!(%error, "postgres persistence disabled: invalid DATABASE_URL");
                None
            }
        }
    })
}
