//! Protocol v1 request payload types (SPEC-HITL-RELAY §2.2). These are
//! a strict superset of the web client's `RequestSummary` so the TS
//! bindings can be derived from this schema (REQ-HITL-RELAY FR-1.4).

use serde::{Deserialize, Serialize};

use crate::state::State;

/// Request classes (SPEC-HITL §4 inputs to tier classification).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RequestClass {
    #[serde(rename = "exec.elevation")]
    ExecElevation,
    #[serde(rename = "credential.fetch")]
    CredentialFetch,
}

/// Approval tier. Serializes as the integer 1 or 2 (FR-3.1); any other
/// value is rejected at the schema boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Tier {
    Tier1 = 1,
    Tier2 = 2,
}

impl Serialize for Tier {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for Tier {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        match u8::deserialize(deserializer)? {
            1 => Ok(Self::Tier1),
            2 => Ok(Self::Tier2),
            other => Err(serde::de::Error::custom(format!("invalid tier: {other}"))),
        }
    }
}

/// Human-auditable action description plus integrity fields. `display`
/// is the only field rendered to approvers (NFR-1.2 redaction boundary).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionSpec {
    pub display: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub argv_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub argv_enc_for_relay: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetSpec {
    pub host: String,
    pub scope: String,
}

/// Credential request parameters. Holds a *path*, never secret bytes
/// (REQ-HITL NFR-1.1): fulfilment materializes the secret via OpenBao
/// response wrapping at execution time only (FR-4.4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CredentialSpec {
    pub bao_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

/// Agent submission payload (SPEC §2.2). Agent-bound by construction:
/// no secret-typed fields exist on this struct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubmitRequest {
    pub request_id: String,
    pub idempotency_key: String,
    pub class: RequestClass,
    pub action: ActionSpec,
    pub target: TargetSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential: Option<CredentialSpec>,
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
    pub tier: Tier,
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
            class: RequestClass::ExecElevation,
            action: ActionSpec {
                display: "sudo systemctl restart wiki".to_string(),
                argv_sha256: Some("ab12".to_string()),
                argv_enc_for_relay: None,
            },
            target: TargetSpec {
                host: "dev-vm-01".to_string(),
                scope: "workspace-ci".to_string(),
            },
            credential: None,
            justification: "restart after deploy".to_string(),
            ttl_seconds: 900,
            agent_nonce: "nonce-32B".to_string(),
        }
    }

    #[test]
    fn submit_request_round_trips_spec_shape() {
        let json = serde_json::to_string(&sample_submit()).expect("ser");
        assert!(json.contains("\"class\":\"exec.elevation\""));
        assert!(!json.contains("\"credential\""));
        let parsed: SubmitRequest = serde_json::from_str(&json).expect("de");
        assert_eq!(parsed, sample_submit());
    }

    #[test]
    fn tier_serializes_as_integer_and_rejects_other_values() {
        assert_eq!(serde_json::to_string(&Tier::Tier1).expect("ser"), "1");
        assert_eq!(serde_json::to_string(&Tier::Tier2).expect("ser"), "2");
        assert!(serde_json::from_str::<Tier>("3").is_err());
        assert!(serde_json::from_str::<Tier>("\"1\"").is_err());
    }

    #[test]
    fn request_summary_is_superset_of_web_type() {
        let summary = RequestSummary {
            id: "r1".to_string(),
            principal: "agent:ci".to_string(),
            host: "dev-vm-01".to_string(),
            action: ActionSpec {
                display: "sudo make deploy".to_string(),
                argv_sha256: None,
                argv_enc_for_relay: None,
            },
            scope: "workspace-ci".to_string(),
            tier: Tier::Tier1,
            justification: "deploy".to_string(),
            request_hash: "sha256:ff".to_string(),
            created_at: "2026-07-25T00:00:00Z".to_string(),
            expires_at: "2026-07-25T00:15:00Z".to_string(),
            state: State::Presented,
        };
        let value = serde_json::to_value(&summary).expect("ser");
        for key in [
            "id",
            "principal",
            "host",
            "action",
            "scope",
            "tier",
            "justification",
            "request_hash",
            "created_at",
            "expires_at",
        ] {
            assert!(value.get(key).is_some(), "missing web-compat field {key}");
        }
        assert_eq!(value["tier"], serde_json::json!(1));
        assert_eq!(value["state"], serde_json::json!("presented"));
    }
}
