//! Protocol v1 request payload types (SPEC-HITL-RELAY §2.2). These are
//! a strict superset of the web client's `RequestSummary` so the TS
//! bindings can be derived from this schema (REQ-HITL-RELAY FR-1.4).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::state::State;

/// Exact UTF-8 sudo invocation submitted for approval.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionSpec {
    pub operation: String,
    pub argv: Vec<String>,
    pub cwd: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub environment: BTreeMap<String, String>,
    pub display: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetSpec {
    pub host: String,
    pub scope: String,
}

/// Agent submission payload (SPEC §2.2). Agent-bound by construction:
/// no secret-typed fields exist on this struct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubmitRequest {
    pub request_id: String,
    pub idempotency_key: String,
    pub action: ActionSpec,
    pub target: TargetSpec,
    /// Forensic free text only (REQ-HITL NFR-3.4); never rendered
    /// without escaping and never parsed as commands.
    pub justification: String,
    pub ttl_seconds: u64,
    pub agent_nonce: String,
}

/// Approver-facing feed row; a strict superset of the web client's
/// `RequestSummary` (`hitl/web/src/types/request.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestSummary {
    pub id: String,
    pub principal: String,
    pub host: String,
    pub action: ActionSpec,
    pub scope: String,
    pub justification: String,
    pub request_hash: String,
    pub created_at: String,
    pub expires_at: String,
    pub state: State,
}

/// Marker for payload types that may be delivered to agent sessions.
/// Implementors must not contain secret-typed fields (schema-level
/// credential-safety rule, SPEC §2.2).
pub trait AgentBound: Serialize {}

/// Marker for payload types that may be delivered to approver sessions.
pub trait ApproverBound: Serialize {}

impl AgentBound for SubmitRequest {}
impl ApproverBound for RequestSummary {}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_submit() -> SubmitRequest {
        SubmitRequest {
            request_id: "01J0000000000000000000000A".to_string(),
            idempotency_key: "01J0000000000000000000000B".to_string(),
            action: ActionSpec {
                operation: "sudo.exec".to_string(),
                argv: vec![
                    "sudo".to_string(),
                    "systemctl".to_string(),
                    "restart".to_string(),
                    "wiki".to_string(),
                ],
                cwd: "/workspace".to_string(),
                environment: BTreeMap::new(),
                display: "sudo systemctl restart wiki".to_string(),
            },
            target: TargetSpec {
                host: "dev-vm-01".to_string(),
                scope: "workspace-ci".to_string(),
            },
            justification: "restart after deploy".to_string(),
            ttl_seconds: 900,
            agent_nonce: "nonce-32B".to_string(),
        }
    }

    #[test]
    fn submit_request_round_trips_spec_shape() {
        let json = serde_json::to_string(&sample_submit()).expect("ser");
        assert!(json.contains("\"operation\":\"sudo.exec\""));
        let parsed: SubmitRequest = serde_json::from_str(&json).expect("de");
        assert_eq!(parsed, sample_submit());
    }

    #[test]
    fn request_summary_is_superset_of_web_type() {
        let summary = RequestSummary {
            id: "r1".to_string(),
            principal: "agent:ci".to_string(),
            host: "dev-vm-01".to_string(),
            action: ActionSpec {
                operation: "sudo.exec".to_string(),
                argv: vec!["sudo".to_string(), "make".to_string(), "deploy".to_string()],
                cwd: "/workspace/WORKSPACE-CI".to_string(),
                environment: BTreeMap::new(),
                display: "sudo make deploy".to_string(),
            },
            scope: "workspace-ci".to_string(),
            justification: "deploy".to_string(),
            request_hash: "sha256:ff".to_string(),
            created_at: "2026-07-25T00:00:00Z".to_string(),
            expires_at: "2026-07-25T00:15:00Z".to_string(),
            state: State::Pending,
        };
        let value = serde_json::to_value(&summary).expect("ser");
        for key in [
            "id",
            "principal",
            "host",
            "action",
            "scope",
            "justification",
            "request_hash",
            "created_at",
            "expires_at",
        ] {
            assert!(value.get(key).is_some(), "missing web-compat field {key}");
        }
        assert_eq!(value["state"], serde_json::json!("pending"));
    }
}
