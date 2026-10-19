//! One-shot maintenance process. Never mount this account's secret in the API.
#[tokio::main]
async fn main() {
    let config = shopping_list_backend::config::Config::from_env();
    let url = config
        .database_url
        .expect("DATABASE_URL or DATABASE_URL_FILE required");
    let pool = sqlx::PgPool::connect(&url)
        .await
        .expect("migration database unavailable");
    shopping_list_backend::db::prepare_database(&pool)
        .await
        .expect("migration failed");
    pool.close().await;
    println!("Database migrations complete. Review runtime grants before starting the API.");
}
