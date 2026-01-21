//! Pure state machine for recording lifecycle.
//!
//! This module implements the state machine as a pure function:
//! `(State, Event) -> (NewState, Vec<SideEffect>)`
//!
//! Invalid transitions return the current state with empty effects.
//! The state machine makes invalid states unrepresentable.

use std::time::Instant;

use super::super::errors::QuickClipError;

/// Recording state machine.
///
/// Each variant carries only the data relevant to that state,
/// making invalid combinations impossible.
#[derive(Debug, Clone, PartialEq)]
pub enum RecordingState {
    /// No recording in progress, ready to start.
    Idle,

    /// Recording has been requested, waiting for portal setup.
    Starting { started_at: Instant },

    /// Actively recording frames.
    Recording {
        started_at: Instant,
        frame_count: u32,
        resolution: (u32, u32),
    },

    /// Stop requested, waiting for threads to finish.
    Stopping {
        started_at: Instant,
        stop_requested_at: Instant,
    },

    /// Recording failed with an error.
    Failed { error: String, recoverable: bool },
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::Idle
    }
}

impl RecordingState {
    /// Returns true if currently in a recording state (Starting, Recording, or Stopping).
    pub fn is_active(&self) -> bool {
        matches!(
            self,
            RecordingState::Starting { .. }
                | RecordingState::Recording { .. }
                | RecordingState::Stopping { .. }
        )
    }

    /// Returns the elapsed time since recording started, if applicable.
    pub fn elapsed(&self) -> Option<std::time::Duration> {
        match self {
            RecordingState::Starting { started_at }
            | RecordingState::Recording { started_at, .. }
            | RecordingState::Stopping { started_at, .. } => Some(started_at.elapsed()),
            _ => None,
        }
    }

    /// Returns the instant when recording started, if applicable.
    pub fn started_at(&self) -> Option<&Instant> {
        match self {
            RecordingState::Starting { started_at }
            | RecordingState::Recording { started_at, .. }
            | RecordingState::Stopping { started_at, .. } => Some(started_at),
            _ => None,
        }
    }
}

/// Events that can trigger state transitions.
#[derive(Debug, Clone)]
pub enum RecordingEvent {
    /// User requested to start recording.
    StartRequested,

    /// User requested to stop recording.
    StopRequested,

    /// Portal is ready with PipeWire stream info.
    PortalReady { resolution: (u32, u32) },

    /// A frame was captured (for frame count tracking).
    /// Note: Currently only exercised in tests. Production use would require
    /// passing event_tx to the capture loop.
    #[allow(dead_code)]
    FrameCaptured,

    /// Capture completed successfully.
    /// Note: frame_count field is captured but not read downstream.
    CaptureCompleted {
        #[allow(dead_code)]
        frame_count: u32,
    },

    /// Encoding/writing completed successfully.
    EncodingCompleted,

    /// An error occurred during capture.
    CaptureFailed { error: QuickClipError },

    /// An error occurred during encoding.
    EncodingFailed { error: QuickClipError },

    /// Portal setup failed.
    PortalFailed { error: QuickClipError },

    /// Reset to idle state (after error acknowledgment or cleanup).
    /// Note: Currently only exercised in tests. Production use would require
    /// a new IPC command for frontend.
    #[allow(dead_code)]
    Reset,
}

/// Side effects triggered by state transitions.
///
/// These are returned by `transition()` and executed by the coordinator.
/// The state machine itself never performs I/O.
#[derive(Debug, Clone, PartialEq)]
pub enum SideEffect {
    /// Start the portal session to get PipeWire access.
    InitiatePortal,

    /// Start capture and writer threads.
    StartCapture { resolution: (u32, u32) },

    /// Send stop signal to capture thread.
    SignalStop,

    /// Emit state change event to frontend.
    EmitStateChange { state: RecordingState },

    /// Clean up resources (kill threads, delete partial files).
    Cleanup,

    /// Save the completed recording to persistence.
    SaveRecording,
}

/// Pure state transition function.
///
/// Returns the new state and any side effects to execute.
/// Invalid transitions return the current state with an empty effect list.
pub fn transition(state: RecordingState, event: RecordingEvent) -> (RecordingState, Vec<SideEffect>) {
    match (&state, event) {
        // Idle + StartRequested -> Starting
        (RecordingState::Idle, RecordingEvent::StartRequested) => {
            let new_state = RecordingState::Starting {
                started_at: Instant::now(),
            };
            let effects = vec![
                SideEffect::InitiatePortal,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Starting + PortalReady -> Recording
        (RecordingState::Starting { .. }, RecordingEvent::PortalReady { resolution }) => {
            let new_state = RecordingState::Recording {
                started_at: Instant::now(),
                frame_count: 0,
                resolution,
            };
            let effects = vec![
                SideEffect::StartCapture { resolution },
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Starting + PortalFailed -> Failed
        (RecordingState::Starting { .. }, RecordingEvent::PortalFailed { error }) => {
            let recoverable = is_recoverable(&error);
            let new_state = RecordingState::Failed {
                error: error.to_string(),
                recoverable,
            };
            let effects = vec![
                SideEffect::Cleanup,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Recording + FrameCaptured -> Recording (updated frame count)
        (
            RecordingState::Recording {
                started_at,
                frame_count,
                resolution,
            },
            RecordingEvent::FrameCaptured,
        ) => {
            let new_state = RecordingState::Recording {
                started_at: *started_at,
                frame_count: frame_count + 1,
                resolution: *resolution,
            };
            // Don't emit state change on every frame (too noisy)
            (new_state, vec![])
        }

        // Recording + StopRequested -> Stopping
        (RecordingState::Recording { started_at, .. }, RecordingEvent::StopRequested) => {
            let new_state = RecordingState::Stopping {
                started_at: *started_at,
                stop_requested_at: Instant::now(),
            };
            let effects = vec![
                SideEffect::SignalStop,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Recording + CaptureFailed -> Failed
        (RecordingState::Recording { .. }, RecordingEvent::CaptureFailed { error }) => {
            let recoverable = is_recoverable(&error);
            let new_state = RecordingState::Failed {
                error: error.to_string(),
                recoverable,
            };
            let effects = vec![
                SideEffect::Cleanup,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Stopping + CaptureCompleted -> Stopping (waiting for encoding)
        (RecordingState::Stopping { .. }, RecordingEvent::CaptureCompleted { .. }) => {
            // Stay in Stopping, wait for encoding to complete
            (state, vec![])
        }

        // Stopping + EncodingCompleted -> Idle
        (RecordingState::Stopping { .. }, RecordingEvent::EncodingCompleted) => {
            let new_state = RecordingState::Idle;
            let effects = vec![
                SideEffect::SaveRecording,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Stopping + CaptureFailed -> Failed
        (RecordingState::Stopping { .. }, RecordingEvent::CaptureFailed { error }) => {
            let recoverable = is_recoverable(&error);
            let new_state = RecordingState::Failed {
                error: error.to_string(),
                recoverable,
            };
            let effects = vec![
                SideEffect::Cleanup,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Stopping + EncodingFailed -> Failed
        (RecordingState::Stopping { .. }, RecordingEvent::EncodingFailed { error }) => {
            let recoverable = is_recoverable(&error);
            let new_state = RecordingState::Failed {
                error: error.to_string(),
                recoverable,
            };
            let effects = vec![
                SideEffect::Cleanup,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Failed + Reset -> Idle
        (RecordingState::Failed { .. }, RecordingEvent::Reset) => {
            let new_state = RecordingState::Idle;
            let effects = vec![SideEffect::EmitStateChange {
                state: new_state.clone(),
            }];
            (new_state, effects)
        }

        // Starting + StopRequested -> Idle (cancel before portal ready)
        (RecordingState::Starting { .. }, RecordingEvent::StopRequested) => {
            let new_state = RecordingState::Idle;
            let effects = vec![
                SideEffect::Cleanup,
                SideEffect::EmitStateChange {
                    state: new_state.clone(),
                },
            ];
            (new_state, effects)
        }

        // Invalid transition: return current state with no effects
        _ => (state, vec![]),
    }
}

/// Determines if an error is recoverable (e.g., can retry after user action).
fn is_recoverable(error: &QuickClipError) -> bool {
    use super::super::errors::PortalError;
    match error {
        QuickClipError::Portal(PortalError::UserCancelled) => true,
        QuickClipError::Portal(PortalError::TokenInvalid) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugins::quickclip::errors::{CaptureError, PortalError};

    #[test]
    fn test_idle_to_starting() {
        let (new_state, effects) = transition(RecordingState::Idle, RecordingEvent::StartRequested);

        assert!(matches!(new_state, RecordingState::Starting { .. }));
        assert_eq!(effects.len(), 2);
        assert!(matches!(effects[0], SideEffect::InitiatePortal));
        assert!(matches!(effects[1], SideEffect::EmitStateChange { .. }));
    }

    #[test]
    fn test_starting_to_recording() {
        let state = RecordingState::Starting {
            started_at: Instant::now(),
        };
        let (new_state, effects) =
            transition(state, RecordingEvent::PortalReady { resolution: (1920, 1080) });

        assert!(matches!(
            new_state,
            RecordingState::Recording {
                resolution: (1920, 1080),
                ..
            }
        ));
        assert_eq!(effects.len(), 2);
        assert!(matches!(
            effects[0],
            SideEffect::StartCapture {
                resolution: (1920, 1080)
            }
        ));
    }

    #[test]
    fn test_recording_to_stopping() {
        let state = RecordingState::Recording {
            started_at: Instant::now(),
            frame_count: 100,
            resolution: (1920, 1080),
        };
        let (new_state, effects) = transition(state, RecordingEvent::StopRequested);

        assert!(matches!(new_state, RecordingState::Stopping { .. }));
        assert_eq!(effects.len(), 2);
        assert!(matches!(effects[0], SideEffect::SignalStop));
    }

    #[test]
    fn test_stopping_to_idle_on_complete() {
        let state = RecordingState::Stopping {
            started_at: Instant::now(),
            stop_requested_at: Instant::now(),
        };
        let (new_state, effects) = transition(state, RecordingEvent::EncodingCompleted);

        assert!(matches!(new_state, RecordingState::Idle));
        assert!(effects
            .iter()
            .any(|e| matches!(e, SideEffect::SaveRecording)));
    }

    #[test]
    fn test_any_state_to_failed_on_error() {
        let state = RecordingState::Recording {
            started_at: Instant::now(),
            frame_count: 50,
            resolution: (1920, 1080),
        };
        let error = QuickClipError::Capture(CaptureError::StreamFailed("test".to_string()));
        let (new_state, effects) = transition(state, RecordingEvent::CaptureFailed { error });

        assert!(matches!(new_state, RecordingState::Failed { .. }));
        assert!(effects.iter().any(|e| matches!(e, SideEffect::Cleanup)));
    }

    #[test]
    fn test_failed_to_idle_on_reset() {
        let state = RecordingState::Failed {
            error: "test error".to_string(),
            recoverable: true,
        };
        let (new_state, effects) = transition(state, RecordingEvent::Reset);

        assert!(matches!(new_state, RecordingState::Idle));
        assert!(effects
            .iter()
            .any(|e| matches!(e, SideEffect::EmitStateChange { .. })));
    }

    #[test]
    fn test_invalid_transition_is_noop() {
        let state = RecordingState::Idle;
        let (new_state, effects) = transition(state.clone(), RecordingEvent::StopRequested);

        assert_eq!(new_state, RecordingState::Idle);
        assert!(effects.is_empty());
    }

    #[test]
    fn test_frame_captured_increments_count() {
        let state = RecordingState::Recording {
            started_at: Instant::now(),
            frame_count: 10,
            resolution: (1920, 1080),
        };
        let (new_state, effects) = transition(state, RecordingEvent::FrameCaptured);

        match new_state {
            RecordingState::Recording { frame_count, .. } => assert_eq!(frame_count, 11),
            _ => panic!("Expected Recording state"),
        }
        assert!(effects.is_empty()); // No event emitted for frame capture
    }

    #[test]
    fn test_user_cancelled_is_recoverable() {
        let state = RecordingState::Starting {
            started_at: Instant::now(),
        };
        let error = QuickClipError::Portal(PortalError::UserCancelled);
        let (new_state, _) = transition(state, RecordingEvent::PortalFailed { error });

        match new_state {
            RecordingState::Failed { recoverable, .. } => assert!(recoverable),
            _ => panic!("Expected Failed state"),
        }
    }

    #[test]
    fn test_starting_can_be_cancelled() {
        let state = RecordingState::Starting {
            started_at: Instant::now(),
        };
        let (new_state, effects) = transition(state, RecordingEvent::StopRequested);

        assert!(matches!(new_state, RecordingState::Idle));
        assert!(effects.iter().any(|e| matches!(e, SideEffect::Cleanup)));
    }
}
