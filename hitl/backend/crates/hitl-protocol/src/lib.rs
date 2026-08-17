#![forbid(unsafe_code)]
//! HITL relay protocol v1 (FR-1.4): versioned envelope types, request
//! payload types, the REQ-HITL §2 lifecycle state machine, and Ed25519
//! signature helpers. Pure data + crypto; no I/O dependencies so the
//! crate stays separately testable and shareable by consumers.

pub mod envelope;
pub mod error;
pub mod sig;
pub mod state;
pub mod types;

pub use envelope::{Envelope, EnvelopeKind, PROTOCOL_VERSION};
pub use error::{ErrorCode, ProtocolError};
pub use state::{can_transition, is_terminal, State, TRANSITIONS};
pub use types::{ActionSpec, AgentBound, ApproverBound, RequestSummary, SubmitRequest, TargetSpec};
