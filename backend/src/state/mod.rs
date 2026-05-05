use std::{collections::HashMap, sync::Arc};

use tokio::sync::RwLock;

use crate::{config::Config, models::product::ProductResponse};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub products_cache: Arc<RwLock<HashMap<String, ProductResponse>>>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            products_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
