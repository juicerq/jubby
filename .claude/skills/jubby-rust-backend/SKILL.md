---
name: jubby-rust-backend
description: Jubby Rust backend rules and reliability constraints. Use when editing `src-tauri` code, adding commands, or touching storage/logging.
---

# Jubby Rust Backend

## Overview

Apply these rules when working in `src-tauri/`.

## Error handling and types

- Never use `panic!` or `unwrap()` in production paths.
- Use `thiserror` for custom errors and propagate with `?`.
- Prefer enums over stringly-typed states.
- Use newtypes for IDs (e.g. `struct TodoId(String)`).
- Validate at boundaries (deserialization).

## Database

- Use transactions for multi-step operations.
- Avoid N+1 queries; prefer joins.
- Always use parameterized queries.

## Logging and async

- Use `tracing` (not `eprintln!`).
- Include structured context.
- Add timeouts for external operations (2 min CLI, 30s APIs).
- Do not block the runtime without `spawn_blocking`.

## Organization

- IPC commands in `commands.rs`.
- Storage code in `storage/`.
