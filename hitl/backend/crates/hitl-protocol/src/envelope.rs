//! Signed envelope: the protocol's single message unit (SPEC §2.2).

use serde::{Deserialize, Serialize};

use crate::error::ProtocolError;

/// Current protocol version (C-5). Breaking changes require a new
/// version path, never an in-place bump.
pub const PROTOCOL_VERSION: u32 = 1;

/// Envelope message types. Unknown variants fail deserialization and
/// surface as `invalid_envelope` (FR-1.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnvelopeKind {
    #[serde(rename = "request.submit")]
    RequestSubmit,
    #[serde(rename = "request.status")]
    RequestStatus,
    #[serde(rename = "decision.result")]
    DecisionResult,
    #[serde(rename = "feed.update")]
    FeedUpdate,
    #[serde(rename = "session.hello")]
    SessionHello,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
}

/// The signed message unit. `sig` is a base64 Ed25519 signature over
/// the canonical (JCS-style) form of the envelope minus `sig`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Envelope {
    pub v: u32,
    #[serde(rename = "type")]
    pub kind: EnvelopeKind,
    pub id: String,
    pub principal: String,
    pub payload: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sig: Option<String>,
}

impl Envelope {
    /// New unsigned envelope at the current protocol version.
    #[must_use]
    pub fn new(
        kind: EnvelopeKind,
        id: String,
        principal: String,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            kind,
            id,
            principal,
            payload,
            sig: None,
        }
    }

    /// Parse and version-check an envelope (FR-1.5): malformed JSON,
    /// unknown types, and version mismatches are structured errors, not
    /// panics.
    pub fn parse(json: &str) -> Result<Self, ProtocolError> {
        let envelope: Self = serde_json::from_str(json)
            .map_err(|e| ProtocolError::InvalidEnvelope(e.to_string()))?;
        if envelope.v != PROTOCOL_VERSION {
            return Err(ProtocolError::UnsupportedVersion(envelope.v));
        }
        Ok(envelope)
    }

    /// Canonical signing bytes: JCS-style canonical JSON of the
    /// envelope with `sig` removed (SPEC §2.2).
    #[must_use]
    pub fn canonical_signing_bytes(&self) -> Vec<u8> {
        let mut value = serde_json::to_value(self).unwrap_or(serde_json::Value::Null);
        if let Some(object) = value.as_object_mut() {
            object.remove("sig");
        }
        crate::sig::canonical_json(&value).into_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Envelope {
        Envelope::new(
            EnvelopeKind::Ping,
            "msg_01".to_string(),
            "agent:ci".to_string(),
            serde_json::json!({}),
        )
    }

    #[test]
    fn envelope_round_trips() {
        let json = serde_json::to_string(&sample()).expect("ser");
        assert!(json.contains("\"type\":\"ping\""));
        let parsed = Envelope::parse(&json).expect("parse");
        assert_eq!(parsed, sample());
    }

    #[test]
    fn parse_rejects_malformed_json_without_panic() {
        let err = Envelope::parse("{not json").expect_err("must fail");
        assert!(matches!(err, ProtocolError::InvalidEnvelope(_)));
    }

    #[test]
    fn parse_rejects_unknown_type_without_panic() {
        let json = r#"{"v":1,"type":"bogus.type","id":"m","principal":"agent:a","payload":{}}"#;
        let err = Envelope::parse(json).expect_err("must fail");
        assert!(matches!(err, ProtocolError::InvalidEnvelope(_)));
    }

    #[test]
    fn parse_rejects_version_mismatch() {
        let json = r#"{"v":2,"type":"ping","id":"m","principal":"agent:a","payload":{}}"#;
        let err = Envelope::parse(json).expect_err("must fail");
        assert!(matches!(err, ProtocolError::UnsupportedVersion(2)));
    }

    #[test]
    fn signing_bytes_exclude_sig() {
        let mut envelope = sample();
        let unsigned = envelope.canonical_signing_bytes();
        envelope.sig = Some("c2ln".to_string());
        assert_eq!(envelope.canonical_signing_bytes(), unsigned);
    }
}
