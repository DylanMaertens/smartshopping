use shopping_list_backend::services::redis_cache::RedisCache;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires TEST_REDIS_URL pointing to a disposable Redis instance"]
async fn distributed_replay_and_rate_limits_are_atomic() {
    let redis = RedisCache::new(&std::env::var("TEST_REDIS_URL").expect("TEST_REDIS_URL required"))
        .expect("invalid TEST_REDIS_URL");
    let nonce = Uuid::new_v4().to_string();
    assert!(redis.claim_request_id(&nonce).await.unwrap());
    assert!(!redis.claim_request_id(&nonce).await.unwrap());

    let client = Uuid::new_v4().to_string();
    assert!(redis.allow_request(&client, 2).await.unwrap());
    assert!(redis.allow_request(&client, 2).await.unwrap());
    assert!(!redis.allow_request(&client, 2).await.unwrap());
}
