use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use serde::Deserialize;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct OpenFoodFactsClient {
    base_url: String,
    client: reqwest::Client,
    min_request_interval: Duration,
    last_request_at: Arc<Mutex<Option<Instant>>>,
    max_retries: u32,
}

#[derive(Debug, Clone)]
pub struct OffProduct {
    pub name: String,
    pub categories: Vec<String>,
    pub image_url: Option<String>,
}

#[derive(Deserialize)]
struct OffResponse {
    status: i32,
    product: Option<OffProductRaw>,
}

#[derive(Deserialize)]
struct OffProductRaw {
    product_name: Option<String>,
    categories_tags: Option<Vec<String>>,
    image_url: Option<String>,
}

impl OpenFoodFactsClient {
    pub fn new(base_url: String, rate_limit_per_minute: u32, max_retries: u32) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("SmartShoppingBackend/0.1 (contact: dev@smartshopping.local)")
            .build()
            .expect("failed building reqwest client");

        let safe_rate = rate_limit_per_minute.max(1);
        let min_request_interval = Duration::from_millis(60_000 / u64::from(safe_rate));

        Self {
            base_url,
            client,
            min_request_interval,
            last_request_at: Arc::new(Mutex::new(None)),
            max_retries,
        }
    }

    pub async fn get_product(&self, barcode: &str) -> Result<Option<OffProduct>, reqwest::Error> {
        let mut attempt = 0;

        loop {
            self.wait_for_rate_limit_slot().await;

            match self.fetch_product(barcode).await {
                Ok(product) => return Ok(product),
                Err(error) if attempt < self.max_retries => {
                    attempt += 1;
                    let delay = Duration::from_millis(150 * 2_u64.pow(attempt));
                    tracing::warn!(attempt, error = %error, "Open Food Facts request failed, retrying");
                    tokio::time::sleep(delay).await;
                }
                Err(error) => return Err(error),
            }
        }
    }

    async fn fetch_product(&self, barcode: &str) -> Result<Option<OffProduct>, reqwest::Error> {
        let url = format!(
            "{}/product/{}",
            self.base_url.trim_end_matches('/'),
            barcode
        );
        let payload = self
            .client
            .get(url)
            .send()
            .await?
            .json::<OffResponse>()
            .await?;

        if payload.status != 1 {
            return Ok(None);
        }

        let Some(raw) = payload.product else {
            return Ok(None);
        };

        Ok(Some(OffProduct {
            name: raw
                .product_name
                .unwrap_or_else(|| "Produit inconnu".to_string()),
            categories: raw.categories_tags.unwrap_or_default(),
            image_url: raw.image_url,
        }))
    }

    async fn wait_for_rate_limit_slot(&self) {
        let mut last_request_at = self.last_request_at.lock().await;

        if let Some(previous) = *last_request_at {
            let elapsed = previous.elapsed();
            if elapsed < self.min_request_interval {
                tokio::time::sleep(self.min_request_interval - elapsed).await;
            }
        }

        *last_request_at = Some(Instant::now());
    }
}
