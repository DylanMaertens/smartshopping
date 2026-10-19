use shopping_list_backend::db::{prepare_database, verify_runtime_role, verify_schema};

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL pointing to a disposable PostgreSQL cluster"]
async fn runtime_cannot_migrate_or_erase_audit() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let owner = sqlx::PgPool::connect(&url).await.unwrap();
    prepare_database(&owner).await.unwrap();
    assert!(verify_runtime_role(&owner).await.is_err());
    let sql = include_str!("../../ops/postgres-runtime-role.sql")
        .lines()
        .filter(|line| !line.starts_with('\\'))
        .collect::<Vec<_>>()
        .join("\n");
    sqlx::raw_sql(&sql).execute(&owner).await.unwrap();
    let app = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SET ROLE poduna_app")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .unwrap();
    verify_schema(&app).await.unwrap();
    verify_runtime_role(&app).await.unwrap();
    for statement in [
        "CREATE TABLE forbidden (id integer)",
        "DELETE FROM admin_decisions",
        "UPDATE admin_decisions SET actor='attacker'",
        "TRUNCATE admin_decisions",
        "DELETE FROM security_decisions",
        "UPDATE security_decisions SET actor='attacker'",
        "TRUNCATE security_decisions",
        "DELETE FROM _sqlx_migrations",
        "DROP TABLE shared_items",
    ] {
        assert!(
            sqlx::query(statement).execute(&app).await.is_err(),
            "{statement}"
        );
    }
    assert!(sqlx::query("SELECT * FROM contact_messages LIMIT 0")
        .execute(&app)
        .await
        .is_ok());
    sqlx::query("INSERT INTO admin_decisions (subject_kind,subject_id,actor,action,reason,previous_status,next_status,created_at) VALUES ('messages',$1,'test','active','Test restricted role','new','active',0)")
        .bind(uuid::Uuid::new_v4()).execute(&app).await.unwrap();
    let device = uuid::Uuid::new_v4();
    sqlx::query("INSERT INTO anonymous_devices(device_id,first_seen_at,last_seen_at,auth_secret) VALUES($1,0,0,'fixture-only')")
        .bind(device.to_string()).execute(&app).await.unwrap();
    let decision = shopping_list_backend::services::access_security::Decision {
        device_id: device, expected_version: None, minutes: 15, reason: "Restricted role audit transaction test".into(),
    };
    // Losing audit INSERT privileges must roll the restriction back, not silently
    // permit an unrecorded administrator action. Disposable test database only.
    sqlx::query("REVOKE INSERT ON security_decisions FROM poduna_app").execute(&owner).await.unwrap();
    assert!(shopping_list_backend::services::access_security::decide(&app, &decision, "test").await.is_err());
    assert!(!shopping_list_backend::services::access_security::blocked(&app, &device.to_string()).await.unwrap());
    sqlx::query("GRANT INSERT ON security_decisions TO poduna_app").execute(&owner).await.unwrap();
    assert!(shopping_list_backend::services::access_security::decide(&app, &decision, "test").await.unwrap());
    assert!(shopping_list_backend::services::access_security::blocked(&app, &device.to_string()).await.unwrap());
    app.close().await;
    owner.close().await;
}
