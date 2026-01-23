---
name: jubby-plugins
description: Jubby plugin structure and storage conventions. Use when adding or modifying plugins, registering them, or working with plugin persistence.
---

# Jubby Plugins

## Overview

Follow this structure when creating or editing plugin UI or storage.

## Frontend

- Each plugin lives in `src/plugins/[name]/`.
- `index.tsx` exports the plugin manifest and the main component.
- Register plugins in `src/plugins/registry.ts`.
- Persist data with `usePluginStorage()`; stored in `~/.local/share/jubby/[plugin].json`.

## Backend

- Backend plugin logic lives in `src-tauri/src/plugins/[name]/`.

## Behavior notes

- Todo plugin: newest first, deletion requires two clicks.
