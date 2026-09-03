use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;

use crate::{
    error::ApiError,
    handlers::sync::{validate_device_id, validate_list_id},
    state::AppState,
};

#[derive(Serialize)]
pub struct InvitationResponse {
    pub code: String,
    pub list_id: String,
    pub expires_at: i64,
}

#[derive(Serialize)]
pub struct JoinedListResponse {
    pub list_id: String,
}

#[derive(Serialize)]
pub struct RevocationResponse {
    pub revoked: bool,
}

#[derive(Serialize)]
pub struct MemberResponse {
    pub device_id: String,
    pub role: String,
    pub joined_at: i64,
}

#[derive(Serialize)]
pub struct MembersResponse {
    pub members: Vec<MemberResponse>,
}

pub async fn list_members(
    State(state): State<AppState>,
    Path(list_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<MembersResponse>, ApiError> {
    let owner_id = validate_device_id(&headers)?;
    validate_list_id(&list_id)?;
    let members = state
        .sharing
        .list_members(state.db_pool.as_ref(), &list_id, &owner_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to list members");
            ApiError::internal_server_error("failed to list members")
        })?
        .ok_or_else(|| ApiError::forbidden("only the list owner can view members"))?;
    Ok(Json(MembersResponse {
        members: members
            .into_iter()
            .map(|member| MemberResponse {
                device_id: member.device_id,
                role: member.role,
                joined_at: member.joined_at,
            })
            .collect(),
    }))
}

pub async fn remove_member(
    State(state): State<AppState>,
    Path((list_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<RevocationResponse>, ApiError> {
    let owner_id = validate_device_id(&headers)?;
    validate_list_id(&list_id)?;
    uuid::Uuid::parse_str(&member_id)
        .map_err(|_| ApiError::bad_request("member id must be a valid UUID"))?;
    let removed = state
        .sharing
        .remove_member(state.db_pool.as_ref(), &list_id, &owner_id, &member_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to remove member");
            ApiError::internal_server_error("failed to remove member")
        })?
        .ok_or_else(|| ApiError::forbidden("only the list owner can remove members"))?;
    if !removed {
        return Err(ApiError::not_found("member not found"));
    }
    Ok(Json(RevocationResponse { revoked: true }))
}

pub async fn create_invitation(
    State(state): State<AppState>,
    Path(list_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<InvitationResponse>, ApiError> {
    let device_id = validate_device_id(&headers)?;
    validate_list_id(&list_id)?;
    let invitation = state
        .sharing
        .create_invitation(state.db_pool.as_ref(), &list_id, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to create invitation");
            ApiError::internal_server_error("failed to create invitation")
        })?
        .ok_or_else(|| ApiError::forbidden("list access required before sharing"))?;

    Ok(Json(InvitationResponse {
        code: invitation.code,
        list_id: invitation.list_id,
        expires_at: invitation.expires_at,
    }))
}

pub async fn join_invitation(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<JoinedListResponse>, ApiError> {
    let device_id = validate_device_id(&headers)?;
    validate_invitation_code(&code)?;
    let list_id = state
        .sharing
        .join(state.db_pool.as_ref(), &code, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to join invitation");
            ApiError::internal_server_error("failed to join invitation")
        })?
        .ok_or_else(|| ApiError::not_found("invitation is invalid, expired or revoked"))?;

    Ok(Json(JoinedListResponse { list_id }))
}

pub async fn revoke_invitation(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<RevocationResponse>, ApiError> {
    let device_id = validate_device_id(&headers)?;
    validate_invitation_code(&code)?;
    let revoked = state
        .sharing
        .revoke(state.db_pool.as_ref(), &code, &device_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to revoke invitation");
            ApiError::internal_server_error("failed to revoke invitation")
        })?;
    if !revoked {
        return Err(ApiError::forbidden(
            "only the invitation creator or list owner can revoke it",
        ));
    }
    Ok(Json(RevocationResponse { revoked }))
}

fn validate_invitation_code(code: &str) -> Result<(), ApiError> {
    if code.len() != 32 || !code.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(ApiError::bad_request(
            "invitation code must be 32 hexadecimal characters",
        ));
    }
    Ok(())
}
