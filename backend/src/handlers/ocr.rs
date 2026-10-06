use crate::error::ApiError;
use axum::{http::StatusCode, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{process::Stdio, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::Semaphore,
};

pub const BODY_LIMIT: usize = 4 * 1024 * 1024;
static OCR_SLOT: Semaphore = Semaphore::const_new(1);
const RUNNER: &str = include_str!("../../ocr/recognize.py");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OcrRequest {
    image_base64: String,
}
#[derive(Serialize, Deserialize)]
pub struct OcrResponse {
    pub text: String,
}

fn error(status: StatusCode, code: &'static str, message: &str) -> ApiError {
    ApiError {
        status,
        code,
        message: message.into(),
    }
}

pub async fn recognize(Json(payload): Json<OcrRequest>) -> Result<Json<OcrResponse>, ApiError> {
    let bytes = STANDARD
        .decode(&payload.image_base64)
        .map_err(|_| ApiError::bad_request("Invalid image encoding"))?;
    if bytes.is_empty()
        || bytes.len() > 3 * 1024 * 1024
        || !(bytes.starts_with(b"\xff\xd8\xff") || bytes.starts_with(b"\x89PNG\r\n\x1a\n"))
    {
        return Err(ApiError::bad_request(
            "A JPEG or PNG image under 3 MiB is required",
        ));
    }
    let _permit = OCR_SLOT.try_acquire().map_err(|_| {
        error(
            StatusCode::TOO_MANY_REQUESTS,
            "OCR_BUSY",
            "OCR is busy; retry shortly",
        )
    })?;
    let python = std::env::var("OCR_PYTHON").unwrap_or_else(|_| "python3".into());
    let mut child = Command::new(python)
        .args(["-c", RUNNER])
        .env("OMP_NUM_THREADS", "2")
        .env("OPENBLAS_NUM_THREADS", "2")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| {
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OCR_UNAVAILABLE",
                "OCR is not installed on this server",
            )
        })?;
    let operation = async {
        let mut input = child.stdin.take().expect("piped stdin");
        input.write_all(&bytes).await.map_err(|_| {
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OCR_UNAVAILABLE",
                "OCR could not start",
            )
        })?;
        drop(input);
        let mut output = Vec::new();
        child
            .stdout
            .take()
            .expect("piped stdout")
            .take(64 * 1024 + 1)
            .read_to_end(&mut output)
            .await
            .map_err(|_| {
                error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "OCR_UNAVAILABLE",
                    "OCR output unavailable",
                )
            })?;
        if output.len() > 64 * 1024 {
            return Err(ApiError::bad_request("Too much text in image"));
        }
        let status = child.wait().await.map_err(|_| {
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OCR_UNAVAILABLE",
                "OCR process unavailable",
            )
        })?;
        if status.code() == Some(2) {
            return Err(ApiError::bad_request("Invalid or oversized image"));
        }
        if !status.success() {
            return Err(error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OCR_UNAVAILABLE",
                "OCR models unavailable",
            ));
        }
        let result: OcrResponse = serde_json::from_slice(&output).map_err(|_| {
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "OCR_UNAVAILABLE",
                "Invalid OCR response",
            )
        })?;
        if result.text.len() > 20_000 {
            return Err(ApiError::bad_request("Too much text in image"));
        }
        Ok(Json(result))
    };
    tokio::time::timeout(Duration::from_secs(25), operation)
        .await
        .map_err(|_| {
            error(
                StatusCode::GATEWAY_TIMEOUT,
                "OCR_TIMEOUT",
                "OCR took too long; try a smaller photo",
            )
        })?
}
