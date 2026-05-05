use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ProductResponse {
    pub barcode: String,
    pub product_name: String,
    pub categories: Vec<String>,
    pub image_url: Option<String>,
    pub cached: bool,
    pub stale: bool,
    pub source: String,
    pub ttl_seconds: u64,
}
