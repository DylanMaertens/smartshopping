use redis::AsyncCommands;

use crate::models::product::ProductResponse;

#[derive(Clone)]
pub struct RedisCache {
    client: redis::Client,
}

impl RedisCache {
    pub fn new(url: &str) -> Result<Self, redis::RedisError> {
        Ok(Self {
            client: redis::Client::open(url)?,
        })
    }

    pub async fn get_product(&self, barcode: &str) -> Option<ProductResponse> {
        let mut connection = self.client.get_multiplexed_async_connection().await.ok()?;
        let raw: Option<String> = connection.get(product_key(barcode)).await.ok()?;
        raw.and_then(|value| serde_json::from_str(&value).ok())
    }

    pub async fn set_product(&self, barcode: &str, product: &ProductResponse, ttl_seconds: u64) {
        let Ok(mut connection) = self.client.get_multiplexed_async_connection().await else {
            return;
        };
        let Ok(serialized) = serde_json::to_string(product) else {
            return;
        };

        let result: redis::RedisResult<()> = connection
            .set_ex(product_key(barcode), serialized, ttl_seconds)
            .await;
        if let Err(error) = result {
            tracing::warn!(%barcode, error = %error, "failed writing product to redis cache");
        }
    }
}

fn product_key(barcode: &str) -> String {
    format!("product:{barcode}")
}
