use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn prepare_database(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub fn create_optional_pool(database_url: Option<&str>) -> Option<PgPool> {
    database_url.and_then(
        |url| match PgPoolOptions::new().max_connections(5).connect_lazy(url) {
            Ok(pool) => Some(pool),
            Err(error) => {
                tracing::warn!(%error, "postgres persistence disabled: invalid DATABASE_URL");
                None
            }
        },
    )
}
