//! Ed25519 signature helpers over the canonical envelope form
//! (FR-1.3, SPEC §2.2).

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::envelope::Envelope;
use crate::error::ProtocolError;

/// JCS-style canonical JSON: object keys sorted recursively, no
/// insignificant whitespace. (Scaffold simplification: RFC 8785 number
/// formatting is approximated by serde_json's shortest-round-trip
/// output; sufficient while all signed numbers are integers. serde_json
/// without the `preserve_order` feature stores objects in a BTreeMap,
/// so iteration order is already key-sorted.)
#[must_use]
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Value::Number(number) => out.push_str(&number.to_string()),
        Value::String(text) => {
            out.push_str(&serde_json::to_string(text).unwrap_or_else(|_| "null".to_string()));
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (index, (key, item)) in map.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap_or_else(|_| "null".to_string()));
                out.push(':');
                write_canonical(item, out);
            }
            out.push('}');
        }
    }
}

/// Sign an envelope in place, returning it with `sig` set.
#[must_use]
pub fn sign_envelope(mut envelope: Envelope, key: &SigningKey) -> Envelope {
    let signature = key.sign(&envelope.canonical_signing_bytes());
    envelope.sig = Some(STANDARD.encode(signature.to_bytes()));
    envelope
}

/// Verify an envelope's signature. Any failure - missing sig, bad
/// base64, wrong length, or verification failure - is the same
/// structured error (FR-7.5 no-oracle shape).
pub fn verify_envelope(envelope: &Envelope, key: &VerifyingKey) -> Result<(), ProtocolError> {
    let encoded = envelope
        .sig
        .as_deref()
        .ok_or(ProtocolError::InvalidSignature)?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| ProtocolError::InvalidSignature)?;
    let raw: [u8; 64] = bytes
        .try_into()
        .map_err(|_| ProtocolError::InvalidSignature)?;
    let signature = Signature::from_bytes(&raw);
    key.verify(&envelope.canonical_signing_bytes(), &signature)
        .map_err(|_| ProtocolError::InvalidSignature)
}

/// Lowercase hex SHA-256, used for request hashes (SPEC §3
/// `request_hash`).
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::EnvelopeKind;

    fn test_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn sample_envelope() -> Envelope {
        Envelope::new(
            EnvelopeKind::RequestSubmit,
            "msg_01".to_string(),
            "agent:ci".to_string(),
            serde_json::json!({"request_id": "r1", "ttl_seconds": 900}),
        )
    }

    #[test]
    fn canonical_json_sorts_object_keys_recursively() {
        let value = serde_json::json!({"b": 1, "a": {"d": [true, null], "c": "x"}});
        assert_eq!(
            canonical_json(&value),
            r#"{"a":{"c":"x","d":[true,null]},"b":1}"#
        );
    }

    #[test]
    fn canonical_form_is_stable() {
        let envelope = sample_envelope();
        assert_eq!(
            envelope.canonical_signing_bytes(),
            envelope.canonical_signing_bytes()
        );
    }

    #[test]
    fn sign_then_verify_succeeds() {
        let key = test_key();
        let envelope = sign_envelope(sample_envelope(), &key);
        verify_envelope(&envelope, &key.verifying_key()).expect("valid signature");
    }

    #[test]
    fn tampered_payload_fails_verification() {
        let key = test_key();
        let mut envelope = sign_envelope(sample_envelope(), &key);
        envelope.payload = serde_json::json!({"request_id": "r2"});
        assert!(verify_envelope(&envelope, &key.verifying_key()).is_err());
    }

    #[test]
    fn missing_or_malformed_sig_is_invalid_signature() {
        let key = test_key();
        let mut envelope = sample_envelope();
        assert!(matches!(
            verify_envelope(&envelope, &key.verifying_key()),
            Err(ProtocolError::InvalidSignature)
        ));
        envelope.sig = Some("not-base64!!".to_string());
        assert!(matches!(
            verify_envelope(&envelope, &key.verifying_key()),
            Err(ProtocolError::InvalidSignature)
        ));
        envelope.sig = Some(STANDARD.encode([1u8; 10]));
        assert!(matches!(
            verify_envelope(&envelope, &key.verifying_key()),
            Err(ProtocolError::InvalidSignature)
        ));
    }

    #[test]
    fn wrong_key_fails_verification() {
        let key = test_key();
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let envelope = sign_envelope(sample_envelope(), &key);
        assert!(verify_envelope(&envelope, &other.verifying_key()).is_err());
    }

    #[test]
    fn sha256_hex_is_lowercase_64_chars() {
        let digest = sha256_hex(b"hitl");
        assert_eq!(digest.len(), 64);
        assert!(digest
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }
}
