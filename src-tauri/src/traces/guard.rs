use std::sync::Arc;

use super::trace::Trace;

/// RAII guard that removes context from the trace stack when dropped
pub struct ContextGuard {
    trace: Arc<Trace>,
}

impl ContextGuard {
    pub(crate) fn new(trace: Arc<Trace>) -> Self {
        Self { trace }
    }
}

impl Drop for ContextGuard {
    fn drop(&mut self) {
        self.trace.pop_context();
    }
}

// ContextGuard is Send + Sync because Arc<Trace> is Send + Sync
// This allows moving the guard across await points in async code
unsafe impl Send for ContextGuard {}
unsafe impl Sync for ContextGuard {}
