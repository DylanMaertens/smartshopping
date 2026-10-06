use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use shopping_list_backend::{config::Config, handlers::products::get_product, state::AppState};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::Mutex;

const BARCODE: &str = "3274080005003";
type Reply = (StatusCode, Value, Duration);
#[derive(Clone, Default)]
struct Mock {
    replies: Arc<Mutex<HashMap<String, Reply>>>,
    calls: Arc<Mutex<Vec<String>>>,
}
struct Fixture {
    state: AppState,
    mock: Mock,
    server: tokio::task::JoinHandle<()>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
async fn fixture() -> Fixture {
    let mock = Mock::default();
    let router = Router::new()
        .route(
            "/:source/product/:barcode",
            get(
                |State(mock): State<Mock>, Path((source, _)): Path<(String, String)>| async move {
                    mock.calls.lock().await.push(source.clone());
                    let (status, value, delay) =
                        mock.replies.lock().await.get(&source).cloned().unwrap_or((
                            StatusCode::NOT_FOUND,
                            json!({"status":0}),
                            Duration::ZERO,
                        ));
                    tokio::time::sleep(delay).await;
                    (status, Json(value))
                },
            ),
        )
        .with_state(mock.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let mut config = Config::from_env();
    config.off_base_url = format!("{base}/food");
    config.products_base_url = format!("{base}/products");
    config.beauty_base_url = format!("{base}/beauty");
    config.petfood_base_url = format!("{base}/petfood");
    config.enable_off_proxy = true;
    config.off_max_retries = 0;
    config.off_rate_limit_per_minute = 60000;
    config.redis_url = None;
    config.database_url = None;
    config.device_registry_path = std::env::temp_dir()
        .join(uuid::Uuid::new_v4().to_string())
        .display()
        .to_string();
    Fixture {
        state: AppState::new(config),
        mock,
        server,
    }
}
async fn reply(f: &Fixture, source: &str, status: StatusCode, value: Value, delay: Duration) {
    f.mock
        .replies
        .lock()
        .await
        .insert(source.into(), (status, value, delay));
}
fn product(name: &str, tags: &[&str]) -> Value {
    json!({"status":1,"product":{"code":BARCODE,"product_name":name,"categories_tags":tags}})
}

#[tokio::test]
async fn ordered_catalogues_stop_at_first_match_then_use_cache() {
    for (source, expected_source, expected_calls) in [
        ("food", "openfoodfacts", vec!["food"]),
        ("products", "openproductsfacts", vec!["food", "products"]),
        (
            "beauty",
            "openbeautyfacts",
            vec!["food", "products", "beauty"],
        ),
        (
            "petfood",
            "openpetfoodfacts",
            vec!["food", "products", "beauty", "petfood"],
        ),
    ] {
        let f = fixture().await;
        reply(
            &f,
            source,
            StatusCode::OK,
            product("Marque", &[]),
            Duration::ZERO,
        )
        .await;
        let Json(found) = get_product(State(f.state.clone()), Path(BARCODE.into()))
            .await
            .unwrap();
        assert_eq!(found.source, expected_source);
        assert_eq!(*f.mock.calls.lock().await, expected_calls);
        if source == "beauty" {
            assert_eq!(found.categories, ["Hygiène & beauté"]);
        }
        if source == "petfood" {
            assert_eq!(found.categories, ["Alimentation animale"]);
        }
        let Json(cached) = get_product(State(f.state.clone()), Path(BARCODE.into()))
            .await
            .unwrap();
        assert_eq!(cached.product_name, "Marque");
        assert_eq!(cached.source, expected_source);
        assert_eq!(*f.mock.calls.lock().await, expected_calls);
    }
}

#[tokio::test]
async fn unnamed_and_wrong_barcode_results_do_not_stop_search() {
    let f = fixture().await;
    reply(
        &f,
        "food",
        StatusCode::OK,
        product("   ", &[]),
        Duration::ZERO,
    )
    .await;
    let mut wrong = product("Wrong", &[]);
    wrong["product"]["code"] = json!("3017620422003");
    reply(&f, "products", StatusCode::OK, wrong, Duration::ZERO).await;
    reply(
        &f,
        "beauty",
        StatusCode::OK,
        json!({"status":1,"product":{"product_name_fr":"Crème visage"}}),
        Duration::ZERO,
    )
    .await;
    let Json(found) = get_product(State(f.state.clone()), Path(BARCODE.into()))
        .await
        .unwrap();
    assert_eq!(found.product_name, "Crème visage");
    assert_eq!(found.categories, ["Soins du visage & du corps"]);
    assert_eq!(*f.mock.calls.lock().await, ["food", "products", "beauty"]);
}

#[tokio::test]
async fn outage_does_not_prevent_later_match_and_is_never_cached() {
    let f = fixture().await;
    reply(
        &f,
        "food",
        StatusCode::INTERNAL_SERVER_ERROR,
        json!({"status":1,"product":{"product_name":"Bad"}}),
        Duration::ZERO,
    )
    .await;
    let error = get_product(State(f.state.clone()), Path(BARCODE.into()))
        .await
        .err()
        .expect("lookup should fail");
    assert_eq!(error.status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(f.state.products_cache.get(BARCODE).await.is_none());
    reply(
        &f,
        "petfood",
        StatusCode::OK,
        product("Poulet pour chat", &["en:meats"]),
        Duration::ZERO,
    )
    .await;
    let Json(found) = get_product(State(f.state.clone()), Path(BARCODE.into()))
        .await
        .unwrap();
    assert_eq!(found.categories, ["Alimentation animale"]);
    assert_eq!(found.source, "openpetfoodfacts");
    assert_eq!(f.mock.calls.lock().await.len(), 8);
}

#[tokio::test]
async fn total_miss_is_not_cached_as_a_product() {
    let f = fixture().await;
    for _ in 0..2 {
        let error = get_product(State(f.state.clone()), Path(BARCODE.into()))
            .await
            .err()
            .expect("lookup should fail");
        assert_eq!(error.status, StatusCode::NOT_FOUND);
    }
    assert!(f.state.products_cache.get(BARCODE).await.is_none());
    assert_eq!(f.mock.calls.lock().await.len(), 8);
}

#[tokio::test]
async fn slow_source_is_bounded_and_next_catalogue_can_succeed() {
    let f = fixture().await;
    reply(
        &f,
        "food",
        StatusCode::OK,
        product("Too late", &[]),
        Duration::from_secs(10),
    )
    .await;
    reply(
        &f,
        "products",
        StatusCode::OK,
        product("Stylo", &[]),
        Duration::ZERO,
    )
    .await;
    let Json(found) = tokio::time::timeout(
        Duration::from_secs(6),
        get_product(State(f.state.clone()), Path(BARCODE.into())),
    )
    .await
    .expect("lookup must move on after four seconds")
    .unwrap();
    assert_eq!(found.source, "openproductsfacts");
    assert_eq!(found.categories, ["Papeterie & fournitures de bureau"]);
}

// Opt-in smoke test: these community catalogue records can change independently of the app.
#[tokio::test]
#[ignore = "requires network access to the four public catalogues"]
async fn live_catalogues_return_named_products() {
    use shopping_list_backend::services::openfoodfacts::OpenFoodFactsClient;
    for (source, code) in [
        ("openfoodfacts", "3274080005003"),
        ("openproductsfacts", "6111259733749"),
        ("openbeautyfacts", "3560070791460"),
        ("openpetfoodfacts", "5998749117774"),
    ] {
        let client = OpenFoodFactsClient::new(format!("https://world.{source}.org/api/v2"), 100, 0);
        let product = tokio::time::timeout(Duration::from_secs(4), client.get_product(code))
            .await
            .expect("catalogue exceeded the application's per-source budget")
            .expect("catalogue request failed")
            .expect("reference product must have a usable name");
        assert!(!product.name.trim().is_empty());
        println!("{source}: {code} -> {}", product.name);
    }
}

#[tokio::test]
async fn catalogue_preserves_specific_beauty_and_pet_categories() {
    for (source, name, tags, expected) in [
        (
            "beauty",
            "Marque",
            vec!["en:hygiene", "en:shampoos"],
            "Soins des cheveux",
        ),
        (
            "beauty",
            "Dentifrice",
            vec!["en:cosmetics"],
            "Hygiène bucco-dentaire",
        ),
        ("beauty", "Crème", vec!["en:creams"], "Hygiène & beauté"),
        (
            "petfood",
            "Shampooing pour chien",
            vec![],
            "Accessoires & hygiène des animaux",
        ),
        (
            "petfood",
            "Produit",
            vec!["en:cat-litter"],
            "Accessoires & hygiène des animaux",
        ),
        (
            "petfood",
            "Poulet",
            vec!["en:meats"],
            "Alimentation animale",
        ),
    ] {
        let f = fixture().await;
        reply(
            &f,
            source,
            StatusCode::OK,
            product(name, &tags),
            Duration::ZERO,
        )
        .await;
        let Json(found) = get_product(State(f.state.clone()), Path(BARCODE.into()))
            .await
            .unwrap();
        assert_eq!(found.categories, [expected], "{name}");
    }
}
