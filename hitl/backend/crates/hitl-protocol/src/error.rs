//! Structured protocol errors (FR-1.5) and the stable RFC 9457 `code`
//! enum (SPEC-HITL-RELAY §2.1).

use serde::{Deserialize, Serialize};

/// Stable machine-readable error codes surfaced as RFC 9457
/// problem+json `code` values by the relay REST API.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidEnvelope,
    AlreadyDecided,
    Expired,
    TierRequired,
    RateLimited,
    FulfilmentFailed,
}

impl ErrorCode {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidEnvelope => "invalid_envelope",
            Self::AlreadyDecided => "already_decided",
            Self::Expired => "expired",
            Self::TierRequired => "tier_required",
            Self::RateLimited => "rate_limited",
            Self::FulfilmentFailed => "fulfilment_failed",
        }
    }
}

/// Errors produced while parsing or verifying protocol envelopes.
/// Carry no internal detail beyond the stable code (SPEC §2.1).
#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("invalid envelope: {0}")]
    InvalidEnvelope(String),
    #[error("unsupported protocol version: {0}")]
    UnsupportedVersion(u32),
    #[error("invalid signature")]
    InvalidSignature,
}

impl ProtocolError {
    #[must_use]
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidEnvelope(_) | Self::UnsupportedVersion(_) | Self::InvalidSignature => {
                ErrorCode::InvalidEnvelope
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_stable_snake_case_strings() {
        assert_eq!(ErrorCode::InvalidEnvelope.as_str(), "invalid_envelope");
        assert_eq!(ErrorCode::AlreadyDecided.as_str(), "already_decided");
        assert_eq!(ErrorCode::Expired.as_str(), "expired");
        assert_eq!(ErrorCode::TierRequired.as_str(), "tier_required");
        assert_eq!(ErrorCode::RateLimited.as_str(), "rate_limited");
        assert_eq!(ErrorCode::FulfilmentFailed.as_str(), "fulfilment_failed");
    }

    #[test]
    fn code_serializes_as_snake_case() {
        let json = serde_json::to_string(&ErrorCode::AlreadyDecided).expect("serialize");
        assert_eq!(json, "\"already_decided\"");
    }
}
