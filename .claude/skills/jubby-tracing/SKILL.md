---
name: jubby-tracing
description: Jubby JSONL tracing format and locations. Use when touching trace logging, diagnosing trace output, or referencing trace file structure.
---

# Jubby Tracing

## Overview

Use this when modifying or relying on the trace logging system.

## Trace format and location

- Files live in `~/.local/share/jubby/logs/traces/YYYY-MM-DD.jsonl`.
- Each line is JSON with `ts`, `trace`, `level`, `msg`, `ctx`.
- `traceend` includes `duration_ms` and `status` (`ok` or `error`).
- Writer is buffered (32) and flushes every 100ms.
- Cleanup keeps only today and yesterday.

## Relevant files

- `src/lib/trace.ts`
- `src-tauri/src/traces/mod.rs`
- `src-tauri/src/traces/writer.rs`
- `src-tauri/src/traces/types.rs`
