use std::net::SocketAddr;

use shopping_list_backend::{
    config::Config, db::prepare_database, routes::create_router, state::AppState,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let state = AppState::new(config.clone());

    if let Some(pool) = &state.db_pool {
        prepare_database(pool)
            .await
            .expect("failed to connect to PostgreSQL or apply migrations");
        tracing::info!("PostgreSQL persistence ready");
    }

    let app = create_router(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("invalid bind address");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind");

    tracing::info!("backend listening on {}", addr);
    axum::serve(listener, app).await.expect("server error");
}
