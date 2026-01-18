# QuickClip Global Shortcut - Design Document

## Summary

Implement a global shortcut for QuickClip that allows users to start/stop recording even when the Jubby window is closed. The shortcut is customizable and provides visual feedback via the system tray icon.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Global (works when window closed) | QuickClip's value is quick capture - requiring window open adds friction |
| Feedback | Tray icon change | Persistent, non-intrusive, follows other screen recorders |
| Customizable | Yes | Infrastructure exists, user preferences vary |
| Error feedback | System notifications | Non-intrusive but ensures user knows about failures |

## Architecture

### Shortcut Registration

Both shortcuts registered in `lib.rs` setup() hook:
- Window toggle: `F9` (existing)
- QuickClip record/stop: `Ctrl+Shift+R` (default, customizable)

### Recording Toggle Flow

```
Shortcut Pressed
      │
      ▼
┌─────────────────┐
│ Check is_recording │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Recording   Not Recording
    │         │
    ▼         ▼
stop_recording_internal()   start_recording_internal()
    │         │
    ▼         ▼
Emit 'quickclip:recording-stopped'   Emit 'quickclip:recording-started'
```

### Cross-Module Communication

Events used to decouple quickclip from tray:
- `quickclip:recording-started` - Tray sets recording icon
- `quickclip:recording-stopped` - Tray sets normal icon

### Shortcut Conflict Prevention

`validate_shortcut_unique()` in settings.rs checks new shortcut doesn't match any existing registered shortcuts.

## Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Register QuickClip shortcut at startup |
| `src-tauri/src/core/tray.rs` | Event listeners, icon swap function |
| `src-tauri/src/core/settings.rs` | Conflict validation |
| `src-tauri/src/plugins/quickclip/recorder/commands.rs` | `toggle_recording()` function |
| `src-tauri/src/plugins/quickclip/persistence.rs` | `quickclip_update_hotkey` command |
| `src/plugins/quickclip/QuickClipSettings.tsx` | Enable shortcuts UI |
| `src/plugins/quickclip/useQuickClipSettings.ts` | Expose hotkey in hook |
| `src-tauri/icons/tray-icon-recording.png` | New asset |

## Error Handling

Errors during shortcut-triggered recording show system notifications:
- FFmpeg not available
- Capture permission denied
- Disk full
- Any other QuickClipError

## Frontend Sync

When user opens Jubby mid-recording (started via shortcut), the frontend syncs correctly because `useQuickClip` fetches `recorder_status` on mount.
