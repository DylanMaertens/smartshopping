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

    pub async fn claim_request_id(&self, request_id: &str) -> Result<bool, redis::RedisError> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let result: Option<String> = redis::cmd("SET")
            .arg(format!("device-nonce:{request_id}"))
            .arg("1")
            .arg("NX")
            .arg("PX")
            .arg(10 * 60 * 1_000)
            .query_async(&mut connection)
            .await?;
        Ok(result.is_some())
    }

    pub async fn allow_request(&self, client: &str, limit: u32) -> Result<bool, redis::RedisError> {
        let mut connection = self.client.get_multiplexed_async_connection().await?;
        let script = redis::Script::new(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end; return n",
        );
        let count: u32 = script
            .key(format!("api-rate:{client}"))
            .invoke_async(&mut connection)
            .await?;
        Ok(count <= limit)
    }
}

fn product_key(barcode: &str) -> String {
    format!("product:{barcode}")
}
