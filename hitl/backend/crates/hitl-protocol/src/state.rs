//! REQ-HITL §2 lifecycle state machine (FR-2.1). The persisted
//! transition table is the source of truth; it is an immutable const so
//! no runtime code path can mutate legality.

use serde::{Deserialize, Serialize};

/// Request lifecycle states (REQ-HITL §2). Serde names match the queue
/// schema `CHECK` constraint exactly (SPEC-HITL-RELAY §3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Submitted,
    Queued,
    Presented,
    Approved,
    Denied,
    Expired,
    Fulfilled,
    Rejected,
}

impl State {
    /// All states, for exhaustive enumeration in tests and sweepers.
    pub const ALL: [State; 8] = [
        State::Submitted,
        State::Queued,
        State::Presented,
        State::Approved,
        State::Denied,
        State::Expired,
        State::Fulfilled,
        State::Rejected,
    ];
}

/// Immutable legal-transition table (FR-2.1). Terminal states have no
/// outgoing edges. `Approved` is non-terminal until fulfilment resolves
/// to `Fulfilled` or fails closed to `Rejected` (FR-4.7).
pub const TRANSITIONS: &[(State, State)] = &[
    (State::Submitted, State::Queued),
    (State::Submitted, State::Expired),
    (State::Queued, State::Presented),
    (State::Queued, State::Expired),
    (State::Presented, State::Approved),
    (State::Presented, State::Denied),
    (State::Presented, State::Expired),
    (State::Approved, State::Fulfilled),
    (State::Approved, State::Rejected),
];

/// Whether `from -> to` is a legal lifecycle transition.
#[must_use]
pub fn can_transition(from: State, to: State) -> bool {
    TRANSITIONS.contains(&(from, to))
}

/// Terminal states: no further transitions may occur.
#[must_use]
pub fn is_terminal(state: State) -> bool {
    matches!(
        state,
        State::Denied | State::Expired | State::Fulfilled | State::Rejected
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transition_legality_matches_table_exhaustively() {
        for from in State::ALL {
            for to in State::ALL {
                let expected = TRANSITIONS.contains(&(from, to));
                assert_eq!(
                    can_transition(from, to),
                    expected,
                    "can_transition({from:?}, {to:?}) disagrees with TRANSITIONS"
                );
            }
        }
    }

    #[test]
    fn terminal_states_have_no_outgoing_edges() {
        for state in State::ALL {
            if is_terminal(state) {
                for to in State::ALL {
                    assert!(!can_transition(state, to), "{state:?} must be terminal");
                }
            }
        }
    }

    #[test]
    fn non_terminal_states_have_at_least_one_outgoing_edge() {
        for state in State::ALL {
            if !is_terminal(state) {
                assert!(
                    State::ALL.iter().any(|&to| can_transition(state, to)),
                    "{state:?} is stuck"
                );
            }
        }
    }

    #[test]
    fn serde_names_match_queue_schema() {
        let expected = [
            (State::Submitted, "submitted"),
            (State::Queued, "queued"),
            (State::Presented, "presented"),
            (State::Approved, "approved"),
            (State::Denied, "denied"),
            (State::Expired, "expired"),
            (State::Fulfilled, "fulfilled"),
            (State::Rejected, "rejected"),
        ];
        for (state, name) in expected {
            assert_eq!(
                serde_json::to_string(&state).expect("ser"),
                format!("\"{name}\"")
            );
            let parsed: State = serde_json::from_str(&format!("\"{name}\"")).expect("de");
            assert_eq!(parsed, state);
        }
    }
}
