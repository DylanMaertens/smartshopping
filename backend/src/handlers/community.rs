use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::ApiError,
    services::community_catalog::{
        self, CommunitySuggestions, ProposalInput, ProposalReceipt, SubmitError,
        ValidatedCommunityFields,
    },
    state::AppState,
};

#[derive(Deserialize)]
pub struct ConfirmationInput {
    pub agrees: bool,
}

#[derive(Deserialize)]
pub struct ReportInput {
    pub reason: String,
}

#[derive(Serialize)]
pub struct RecordedResponse {
    pub recorded: bool,
    pub publication_status: &'static str,
}

pub async fn get_suggestions(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Result<Json<CommunitySuggestions>, ApiError> {
    validate_barcode(&barcode)?;
    let pool = community_pool(&state)?;
    let mut result = community_catalog::suggestions(pool, &barcode)
        .await
        .map_err(database_error)?;
    result.contributions_enabled = state.config.require_device_signatures;
    Ok(Json(result))
}

pub async fn get_validated_fields(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    validate_barcode(&barcode)?;
    let fields =
        community_catalog::validated_fields(community_pool(&state)?, &barcode, &state.config)
            .await
            .map_err(database_error)?;
    Ok((
        [("cache-control", "no-store")],
        Json(ValidatedCommunityFields {
            barcode,
            fields,
            contributions_enabled: state.config.require_device_signatures,
        }),
    ))
}

pub async fn propose(
    State(state): State<AppState>,
    Path(barcode): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ProposalInput>,
) -> Result<(StatusCode, Json<ProposalReceipt>), ApiError> {
    validate_barcode(&barcode)?;
    ensure_mutations_are_safe(&state)?;
    let device_id = authenticated_device(&headers)?;
    let pool = community_pool(&state)?;
    match community_catalog::submit_proposals(pool, &barcode, &device_id, input, &state.config)
        .await
    {
        Ok(receipt) => Ok((StatusCode::CREATED, Json(receipt))),
        Err(SubmitError::Validation(message)) => Err(ApiError::bad_request(message)),
        Err(SubmitError::Quota) => Err(quota_error()),
        Err(SubmitError::Database(error)) => Err(database_error(error)),
    }
}

pub async fn confirm(
    State(state): State<AppState>,
    Path(proposal_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<ConfirmationInput>,
) -> Result<Json<RecordedResponse>, ApiError> {
    ensure_mutations_are_safe(&state)?;
    let device_id = authenticated_device(&headers)?;
    let pool = community_pool(&state)?;
    let exists =
        community_catalog::confirm(pool, proposal_id, &device_id, input.agrees, &state.config)
            .await
            .map_err(|error| match error {
                SubmitError::Validation(message) => ApiError::bad_request(message),
                SubmitError::Quota => quota_error(),
                SubmitError::Database(error) => database_error(error),
            })?;
    if !exists {
        return Err(ApiError::not_found("Community proposal not found"));
    }
    Ok(Json(RecordedResponse {
        recorded: true,
        publication_status: "received",
    }))
}

pub async fn report(
    State(state): State<AppState>,
    Path(proposal_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<ReportInput>,
) -> Result<(StatusCode, Json<RecordedResponse>), ApiError> {
    ensure_mutations_are_safe(&state)?;
    if !matches!(
        input.reason.as_str(),
        "wrong_product" | "wrong_name" | "wrong_category" | "abuse" | "spam"
    ) {
        return Err(ApiError::bad_request("Invalid report reason"));
    }
    let device_id = authenticated_device(&headers)?;
    let pool = community_pool(&state)?;
    let Some(_) = community_catalog::report(pool, proposal_id, &device_id, &input.reason)
        .await
        .map_err(database_error)?
    else {
        return Err(ApiError::not_found("Community proposal not found"));
    };
    Ok((
        StatusCode::CREATED,
        Json(RecordedResponse {
            recorded: true,
            publication_status: "received",
        }),
    ))
}

fn community_pool(state: &AppState) -> Result<&sqlx::PgPool, ApiError> {
    if !state.config.enable_community_catalog {
        return Err(ApiError::not_found("Community catalog disabled"));
    }
    state.db_pool.as_ref().ok_or_else(|| ApiError {
        status: StatusCode::SERVICE_UNAVAILABLE,
        code: "COMMUNITY_CATALOG_UNAVAILABLE",
        message: "Community catalog persistence is unavailable".into(),
    })
}

fn ensure_mutations_are_safe(state: &AppState) -> Result<(), ApiError> {
    if !state.config.require_device_signatures {
        return Err(ApiError::forbidden(
            "Community mutations require device signatures",
        ));
    }
    Ok(())
}

fn authenticated_device(headers: &HeaderMap) -> Result<String, ApiError> {
    headers
        .get("x-device-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(|value| value.to_string())
        .ok_or_else(|| ApiError::bad_request("Missing or invalid device id"))
}

fn validate_barcode(barcode: &str) -> Result<(), ApiError> {
    if (8..=14).contains(&barcode.len())
        && barcode.chars().all(|character| character.is_ascii_digit())
    {
        Ok(())
    } else {
        Err(ApiError::bad_request("Invalid barcode format"))
    }
}

fn database_error(error: sqlx::Error) -> ApiError {
    tracing::error!(%error, "community catalog database error");
    ApiError::internal_server_error("Community catalog operation failed")
}

fn quota_error() -> ApiError {
    ApiError {
        status: StatusCode::TOO_MANY_REQUESTS,
        code: "COMMUNITY_QUOTA",
        message: "Daily community contribution limit reached".into(),
    }
}
