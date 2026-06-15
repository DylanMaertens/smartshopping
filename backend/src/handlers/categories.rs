use axum::Json;
use serde::{Deserialize, Serialize};

use crate::services::categories;

#[derive(Serialize)]
pub struct Category {
    id: String,
    name: String,
    order_index: u16,
    icon: String,
}

#[derive(Deserialize)]
pub struct ClassifyRequest {
    product_name: String,
}

#[derive(Serialize)]
pub struct CategoryResult {
    category_id: String,
    category_name: String,
    confidence: f32,
}

pub async fn get_categories() -> Json<Vec<Category>> {
    Json(
        categories::STORE_CATEGORIES
            .iter()
            .map(|category| Category {
                id: category.id.to_string(),
                name: category.name.to_string(),
                order_index: category.order_index,
                icon: category.icon.to_string(),
            })
            .collect(),
    )
}

pub async fn classify_product(Json(payload): Json<ClassifyRequest>) -> Json<CategoryResult> {
    let result = categories::classify_product(&payload.product_name, &[]);

    Json(CategoryResult {
        category_id: result.category_id,
        category_name: result.category_name,
        confidence: result.confidence,
    })
}
