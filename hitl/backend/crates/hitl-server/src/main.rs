#![forbid(unsafe_code)]
//! hitl-server: HITL relay binary (scaffold, SPEC-HITL-RELAY §1).
//! Health and readiness endpoints plus the protocol version route only;
//! the REST control API, live channel, persistence, and PDP land with the
//! hitl-queue / hitl-pdp / hitl-cdp crates.

use axum::{http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};

fn app() -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/api/v1/meta/version", get(protocol_version))
}

async fn healthz() -> &'static str {
    "ok\n"
}

/// Readiness fails closed (NFR-2.2): until queue, Keycloak JWKS,
/// persistence, identity verification, and the audit sink are wired, the service reports not-ready.
async fn readyz() -> (StatusCode, Json<Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "ready": false,
            "dependencies": {
                "queue": "unconfigured",
                "keycloak_jwks": "unconfigured",
                "openbao": "unconfigured",
                "audit": "unconfigured"
            }
        })),
    )
}

async fn protocol_version() -> Json<Value> {
    Json(json!({ "protocol": hitl_protocol::PROTOCOL_VERSION }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hitl_server=info,tower_http=info".into()),
        )
        .init();
    let addr = std::env::var("RELAY_LISTEN").unwrap_or_else(|_| "127.0.0.1:8443".to_string());
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));
    tracing::info!(%addr, "hitl-server listening");
    axum::serve(listener, app())
        .await
        .unwrap_or_else(|e| panic!("server error: {e}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt as _;

    #[tokio::test]
    async fn healthz_returns_ok() {
        let response = app()
            .oneshot(
                Request::get("/healthz")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn readyz_fails_closed_when_unconfigured() {
        let response = app()
            .oneshot(
                Request::get("/readyz")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn meta_version_reports_protocol_v1() {
        let response = app()
            .oneshot(
                Request::get("/api/v1/meta/version")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("body");
        let value: Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(value["protocol"], serde_json::json!(1));
    }
}
