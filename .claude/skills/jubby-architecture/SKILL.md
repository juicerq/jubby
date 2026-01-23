---
name: jubby-architecture
description: Jubby codebase map and navigation hints. Use when you need a quick overview of where frontend/backend code lives, import boundaries, or how to locate features.
---

# Jubby Architecture

## Overview

Use this skill to orient changes and pick the right area of the repo before editing.

## Codebase map

- Frontend lives in `src/`.
  - `core/` for layout, context, hooks, shared types.
  - `plugins/` for plugin UI (registry in `src/plugins/registry.ts`).
  - `shared/` for shared UI components and utilities.
- Backend lives in `src-tauri/src/`.
  - `core/` for tray, window, settings, logging.
  - `plugins/` for backend plugin logic.
  - `shared/` for common paths and error types.

## Boundaries

- Import direction is `shared/` -> `core/` -> `plugins/`.
- Do not import `plugins/` from `core/` or `shared/`.
- Prefer searching for capabilities with `rg` instead of assuming a path.
