use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const LOCAL_PREFIX: &str = "enc:v1";

#[derive(Clone, Default)]
pub struct SecretCipher {
    local_keys: Vec<KeyEntry>,
    vault: Option<VaultTransit>,
}

#[derive(Clone)]
struct KeyEntry {
    id: String,
    key: [u8; 32],
}

#[derive(Clone)]
struct VaultTransit {
    address: String,
    token: String,
    key: String,
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct VaultResponse<T> {
    data: T,
}

#[derive(Deserialize)]
struct VaultCiphertext {
    ciphertext: String,
}

#[derive(Deserialize)]
struct VaultPlaintext {
    plaintext: String,
}

impl SecretCipher {
    pub fn from_env() -> Result<Self, String> {
        if let Some(address) = env_or_file("VAULT_ADDR").filter(|value| !value.is_empty()) {
            if !address.starts_with("https://")
                && !address.starts_with("http://127.0.0.1")
                && !address.starts_with("http://localhost")
            {
                return Err("VAULT_ADDR must use HTTPS outside localhost".to_string());
            }
            let token = env_or_file("VAULT_TOKEN")
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "VAULT_TOKEN or VAULT_TOKEN_FILE is required".to_string())?;
            let key = std::env::var("VAULT_TRANSIT_KEY")
                .unwrap_or_else(|_| "smartshopping-device-secrets".to_string());
            let mut local_keys = Vec::new();
            if let Some(current) =
                env_or_file("DEVICE_SECRET_KEY").filter(|value| !value.trim().is_empty())
            {
                local_keys.push(decode_key(&current)?);
            }
            if let Some(previous) =
                env_or_file("DEVICE_SECRET_PREVIOUS_KEY").filter(|value| !value.trim().is_empty())
            {
                local_keys.push(decode_key(&previous)?);
            }
            return Ok(Self {
                local_keys,
                vault: Some(VaultTransit {
                    address: address.trim_end_matches('/').to_string(),
                    token,
                    key,
                    client: vault_http_client()?,
                }),
            });
        }

        let Some(current) =
            env_or_file("DEVICE_SECRET_KEY").filter(|value| !value.trim().is_empty())
        else {
            tracing::warn!(
                "no Vault or DEVICE_SECRET_KEY configured; device secrets use development plaintext storage"
            );
            return Ok(Self::default());
        };
        Self::from_base64_keys(
            &current,
            env_or_file("DEVICE_SECRET_PREVIOUS_KEY")
                .filter(|value| !value.trim().is_empty())
                .as_deref(),
        )
    }

    pub fn from_base64_keys(current: &str, previous: Option<&str>) -> Result<Self, String> {
        let mut local_keys = vec![decode_key(current)?];
        if let Some(previous) = previous {
            local_keys.push(decode_key(previous)?);
        }
        Ok(Self {
            local_keys,
            vault: None,
        })
    }

    pub fn from_vault(address: &str, token: &str, key: &str) -> Self {
        Self {
            local_keys: Vec::new(),
            vault: Some(VaultTransit {
                address: address.trim_end_matches('/').to_string(),
                token: token.to_string(),
                key: key.to_string(),
                client: vault_http_client().expect("Vault HTTP client configuration is valid"),
            }),
        }
    }

    pub async fn encrypt(&self, plaintext: &str) -> Result<String, String> {
        if let Some(vault) = &self.vault {
            let response = vault
                .client
                .post(format!(
                    "{}/v1/transit/encrypt/{}",
                    vault.address, vault.key
                ))
                .header("X-Vault-Token", &vault.token)
                .json(&serde_json::json!({ "plaintext": STANDARD.encode(plaintext) }))
                .send()
                .await
                .map_err(|error| format!("Vault encrypt request failed: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Vault encrypt rejected: {error}"))?
                .json::<VaultResponse<VaultCiphertext>>()
                .await
                .map_err(|error| format!("invalid Vault encrypt response: {error}"))?;
            tracing::info!(
                provider = "vault-transit",
                operation = "encrypt",
                "device secret cryptographic operation"
            );
            return Ok(response.data.ciphertext);
        }

        let Some(entry) = self.local_keys.first() else {
            return Ok(plaintext.to_string());
        };
        let cipher = Aes256Gcm::new_from_slice(&entry.key).map_err(|error| error.to_string())?;
        let mut nonce = [0_u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let encrypted = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
            .map_err(|_| "device secret encryption failed".to_string())?;
        Ok(format!(
            "{LOCAL_PREFIX}:{}:{}:{}",
            entry.id,
            STANDARD.encode(nonce),
            STANDARD.encode(encrypted)
        ))
    }

    pub async fn decrypt(&self, stored: &str) -> Result<String, String> {
        if stored.starts_with("vault:") {
            let vault = self
                .vault
                .as_ref()
                .ok_or_else(|| "Vault Transit is required to decrypt this secret".to_string())?;
            let response = vault
                .client
                .post(format!(
                    "{}/v1/transit/decrypt/{}",
                    vault.address, vault.key
                ))
                .header("X-Vault-Token", &vault.token)
                .json(&serde_json::json!({ "ciphertext": stored }))
                .send()
                .await
                .map_err(|error| format!("Vault decrypt request failed: {error}"))?
                .error_for_status()
                .map_err(|error| format!("Vault decrypt rejected: {error}"))?
                .json::<VaultResponse<VaultPlaintext>>()
                .await
                .map_err(|error| format!("invalid Vault decrypt response: {error}"))?;
            tracing::info!(
                provider = "vault-transit",
                operation = "decrypt",
                "device secret cryptographic operation"
            );
            let bytes = STANDARD
                .decode(response.data.plaintext)
                .map_err(|error| format!("invalid Vault plaintext: {error}"))?;
            return String::from_utf8(bytes).map_err(|error| error.to_string());
        }
        if !stored.starts_with("enc:") {
            return Ok(stored.to_string());
        }
        let parts: Vec<_> = stored.split(':').collect();
        if parts.len() != 5 || format!("{}:{}", parts[0], parts[1]) != LOCAL_PREFIX {
            return Err("unsupported encrypted device secret".to_string());
        }
        let entry = self
            .local_keys
            .iter()
            .find(|entry| entry.id == parts[2])
            .ok_or_else(|| "device secret encryption key is unavailable".to_string())?;
        let nonce = STANDARD
            .decode(parts[3])
            .map_err(|error| error.to_string())?;
        let encrypted = STANDARD
            .decode(parts[4])
            .map_err(|error| error.to_string())?;
        if nonce.len() != 12 {
            return Err("invalid encrypted device secret nonce".to_string());
        }
        let cipher = Aes256Gcm::new_from_slice(&entry.key).map_err(|error| error.to_string())?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), encrypted.as_ref())
            .map_err(|_| "device secret decryption failed".to_string())?;
        String::from_utf8(plaintext).map_err(|error| error.to_string())
    }

    pub fn needs_rotation(&self, stored: &str) -> bool {
        if self.vault.is_some() {
            return !stored.starts_with("vault:");
        }
        self.local_keys
            .first()
            .is_some_and(|current| !stored.starts_with(&format!("{LOCAL_PREFIX}:{}:", current.id)))
    }
}

fn decode_key(encoded: &str) -> Result<KeyEntry, String> {
    let decoded = STANDARD
        .decode(encoded.trim())
        .map_err(|error| error.to_string())?;
    let key: [u8; 32] = decoded.try_into().map_err(|_| {
        "DEVICE_SECRET_KEY must contain exactly 32 base64-encoded bytes".to_string()
    })?;
    let id = hex::encode(Sha256::digest(key))[..12].to_string();
    Ok(KeyEntry { id, key })
}

fn env_or_file(name: &str) -> Option<String> {
    std::env::var(name).ok().or_else(|| {
        let path = std::env::var(format!("{name}_FILE")).ok()?;
        std::fs::read_to_string(path)
            .ok()
            .map(|value| value.trim().to_string())
    })
}

fn vault_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::SecretCipher;
    use axum::{extract::Path, routing::post, Json, Router};
    use serde_json::{json, Value};

    #[tokio::test]
    async fn decrypts_with_previous_key_and_marks_for_rotation() {
        let old =
            SecretCipher::from_base64_keys("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", None)
                .unwrap();
        let keyring = SecretCipher::from_base64_keys(
            "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
            Some("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
        )
        .unwrap();
        let stored = old.encrypt("secret").await.unwrap();
        assert_eq!(keyring.decrypt(&stored).await.unwrap(), "secret");
        assert!(keyring.needs_rotation(&stored));
    }

    #[tokio::test]
    async fn delegates_encryption_and_decryption_to_vault_transit() {
        async fn transit(Path(action): Path<String>, Json(body): Json<Value>) -> Json<Value> {
            if action == "encrypt" {
                assert_eq!(body["plaintext"], "c2VjcmV0");
                Json(json!({ "data": { "ciphertext": "vault:v1:test" } }))
            } else {
                assert_eq!(body["ciphertext"], "vault:v1:test");
                Json(json!({ "data": { "plaintext": "c2VjcmV0" } }))
            }
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/v1/transit/:action/test-key", post(transit)),
            )
            .await
            .unwrap();
        });
        let cipher = SecretCipher::from_vault(&address, "test-token", "test-key");
        let encrypted = cipher.encrypt("secret").await.unwrap();
        assert_eq!(encrypted, "vault:v1:test");
        assert_eq!(cipher.decrypt(&encrypted).await.unwrap(), "secret");
    }
}
