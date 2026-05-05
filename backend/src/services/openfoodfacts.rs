use serde::Deserialize;

#[derive(Clone)]
pub struct OpenFoodFactsClient {
    base_url: String,
    client: reqwest::Client,
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
    pub fn new(base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .user_agent("SmartShoppingBackend/0.1")
            .build()
            .expect("failed building reqwest client");

        Self { base_url, client }
    }

    pub async fn get_product(&self, barcode: &str) -> Result<Option<OffProduct>, reqwest::Error> {
        let url = format!("{}/product/{}", self.base_url.trim_end_matches('/'), barcode);
        let payload = self.client.get(url).send().await?.json::<OffResponse>().await?;

        if payload.status != 1 {
            return Ok(None);
        }

        let Some(raw) = payload.product else {
            return Ok(None);
        };

        Ok(Some(OffProduct {
            name: raw.product_name.unwrap_or_else(|| "Produit inconnu".to_string()),
            categories: raw.categories_tags.unwrap_or_default(),
            image_url: raw.image_url,
        }))
    }
}
