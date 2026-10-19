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
    if std::env::var("REQUIRE_RESTRICTED_DATABASE_ROLE").as_deref() == Ok("true") {
        assert!(
            state.db_pool.is_some(),
            "restricted database mode requires a valid PostgreSQL configuration"
        );
    }

    if let Some(pool) = &state.db_pool {
        let restricted = std::env::var("REQUIRE_RESTRICTED_DATABASE_ROLE").as_deref() == Ok("true");
        let migrate = std::env::var("RUN_DATABASE_MIGRATIONS").as_deref() != Ok("false");
        assert!(!(restricted && migrate), "restricted API must use RUN_DATABASE_MIGRATIONS=false and a separate migration process");
        if restricted {
            shopping_list_backend::db::verify_runtime_role(pool)
                .await
                .expect("unsafe PostgreSQL runtime role; provision least-privilege grants first");
        }
        if migrate {
            prepare_database(pool)
                .await
                .expect("failed to connect to PostgreSQL or apply migrations");
        } else {
            shopping_list_backend::db::verify_schema(pool)
                .await
                .expect("database schema not ready; run migrate-db separately");
        }
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
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("server error");
}
