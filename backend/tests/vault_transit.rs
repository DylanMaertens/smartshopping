use shopping_list_backend::services::secret_cipher::SecretCipher;

#[tokio::test]
#[ignore = "requires TEST_VAULT_ADDR and TEST_VAULT_TOKEN"]
async fn vault_transit_keeps_ciphertexts_readable_after_key_rotation() {
    let address = std::env::var("TEST_VAULT_ADDR").expect("TEST_VAULT_ADDR is required");
    let token = std::env::var("TEST_VAULT_TOKEN").expect("TEST_VAULT_TOKEN is required");
    let key = std::env::var("TEST_VAULT_KEY")
        .unwrap_or_else(|_| "smartshopping-device-secrets".to_string());
    let cipher = SecretCipher::from_vault(&address, &token, &key);

    let before_rotation = cipher.encrypt("device-secret-before").await.unwrap();
    assert!(before_rotation.starts_with("vault:v1:"));

    reqwest::Client::new()
        .post(format!("{address}/v1/transit/keys/{key}/rotate"))
        .header("X-Vault-Token", &token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();

    let after_rotation = cipher.encrypt("device-secret-after").await.unwrap();
    assert!(after_rotation.starts_with("vault:v2:"));
    assert_eq!(
        cipher.decrypt(&before_rotation).await.unwrap(),
        "device-secret-before"
    );
    assert_eq!(
        cipher.decrypt(&after_rotation).await.unwrap(),
        "device-secret-after"
    );
}
