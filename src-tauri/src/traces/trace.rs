use std::sync::atomic::AtomicBool;
use std::sync::{mpsc::Sender, Arc, RwLock};
use std::time::Instant;

use serde_json::Value;

use super::guard::ContextGuard;
use super::types::LogEntry;

/// A trace represents a unit of work that can be tracked across async boundaries
pub struct Trace {
    id: String,
    started_at: Instant,
    context: RwLock<Vec<Value>>,
    writer_tx: Sender<LogEntry>,
    has_error: AtomicBool,
}

impl Trace {
    /// Generate a random 8-character hex trace ID
    fn generate_trace_id() -> String {
        format!("{:08x}", rand::random::<u32>())
    }

    /// Create a new trace with a generated ID
    pub fn new(writer_tx: Sender<LogEntry>) -> Self {
        Self {
            id: Self::generate_trace_id(),
            started_at: Instant::now(),
            context: RwLock::new(Vec::new()),
            writer_tx,
            has_error: AtomicBool::new(false),
        }
    }

    /// Continue an existing trace from a frontend trace ID
    pub fn continue_from(id: String, writer_tx: Sender<LogEntry>) -> Self {
        Self {
            id,
            started_at: Instant::now(),
            context: RwLock::new(Vec::new()),
            writer_tx,
            has_error: AtomicBool::new(false),
        }
    }

    /// Get the trace ID
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Add initial context via builder pattern
    pub fn with(self, key: &str, value: impl Into<Value>) -> Self {
        {
            let mut ctx = self.context.write().unwrap();
            let mut obj = serde_json::Map::new();
            obj.insert(key.to_string(), value.into());
            ctx.push(Value::Object(obj));
        }
        self
    }

    /// Remove the last context from the stack (called by ContextGuard::drop)
    pub(crate) fn pop_context(&self) {
        let mut ctx = self.context.write().unwrap();
        ctx.pop();
    }

    /// Push context onto the stack and return a guard that pops it when dropped
    pub fn push(self: &Arc<Self>, ctx: Value) -> ContextGuard {
        {
            let mut context = self.context.write().unwrap();
            context.push(ctx);
        }
        ContextGuard::new(Arc::clone(self))
    }

    /// Merge all context stack entries into a single object
    /// Later values override earlier ones for the same key
    pub fn merged_context(&self) -> Value {
        let context = self.context.read().unwrap();
        let mut merged = serde_json::Map::new();

        for ctx_value in context.iter() {
            if let Value::Object(obj) = ctx_value {
                for (key, value) in obj {
                    merged.insert(key.clone(), value.clone());
                }
            }
        }

        Value::Object(merged)
    }
}

// Trace is Send + Sync for async usage
unsafe impl Send for Trace {}
unsafe impl Sync for Trace {}
