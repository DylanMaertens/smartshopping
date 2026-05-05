use axum::Json;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Category {
    id: String,
    name: String,
}

#[derive(Deserialize)]
pub struct ClassifyRequest {
    product_name: String,
}

#[derive(Serialize)]
pub struct CategoryResult {
    category: String,
    confidence: f32,
}

pub async fn get_categories() -> Json<Vec<Category>> {
    Json(vec![
        Category { id: "fruits-legumes".into(), name: "Fruits & Légumes".into() },
        Category { id: "epicerie".into(), name: "Épicerie".into() },
    ])
}

pub async fn classify_product(Json(payload): Json<ClassifyRequest>) -> Json<CategoryResult> {
    let category = if payload.product_name.to_lowercase().contains("lait") {
        "Produits laitiers"
    } else {
        "Épicerie"
    };

    Json(CategoryResult { category: category.to_string(), confidence: 0.7 })
}
