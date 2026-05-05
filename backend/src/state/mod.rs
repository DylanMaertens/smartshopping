use std::{collections::HashMap, sync::Arc};

use tokio::sync::RwLock;

use crate::{config::Config, models::product::ProductResponse, services::openfoodfacts::OpenFoodFactsClient};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub products_cache: Arc<RwLock<HashMap<String, ProductResponse>>>,
    pub off_client: OpenFoodFactsClient,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let off_client = OpenFoodFactsClient::new(config.off_base_url.clone());

        Self {
            config,
            products_cache: Arc::new(RwLock::new(HashMap::new())),
            off_client,
        }
    }
}
