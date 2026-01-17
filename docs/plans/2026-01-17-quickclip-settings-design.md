# QuickClip Settings UX Design

**Date:** 2026-01-17
**Status:** Approved

## Overview

Design for a settings panel in the QuickClips video recording plugin, allowing users to configure capture mode, audio sources, encoding quality, resolution, and global hotkey.

## Access & Navigation

- **Trigger:** Gear icon in QuickClip header (using `lucide-react`)
- **Navigation:** Breadcrumb pattern: `Jubby / QuickClips / Settings`
- **Return:** Click "QuickClips" in breadcrumb to return to recording list

## Layout

Three grouped sections following the existing `SettingsSection` + `SettingsRow` pattern:

```
┌─────────────────────────────────┐
│ Jubby / QuickClips / Settings   │
├─────────────────────────────────┤
│ CAPTURE                         │
│ ┌─────────────────────────────┐ │
│ │ Screen     [Fullscreen|Area]│ │
│ │ Audio      ☐ System  ☐ Mic  │ │
│ └─────────────────────────────┘ │
│                                 │
│ ENCODING                        │
│ ┌─────────────────────────────┐ │
│ │ Quality    [Light|High]     │ │
│ │ Resolution [Native|720p|480p]│ │
│ └─────────────────────────────┘ │
│                                 │
│ SHORTCUTS                       │
│ ┌─────────────────────────────┐ │
│ │ Record     [Ctrl+Shift+R]   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Controls

### Capture Section

| Setting | Control | Options |
|---------|---------|---------|
| Screen | Segmented toggle | `Fullscreen` \| `Area` |
| Audio | Two checkboxes | `System audio`, `Microphone` |

- Audio checkboxes are independent
- Both unchecked = no audio
- Both checked = capture both sources

### Encoding Section

| Setting | Control | Options |
|---------|---------|---------|
| Quality | Segmented toggle | `Light` \| `High` |
| Resolution | Segmented toggle | `Native` \| `720p` \| `480p` |

- Quality affects encoding speed/compression (CRF values)
- Resolution is independent from quality

### Shortcuts Section

| Setting | Control |
|---------|---------|
| Record | Hotkey button (reuse existing component from global settings) |

## Behavior

- **Auto-save:** Every change persists immediately
- **Storage:** `~/.local/share/jubby/quickclip.json` via `usePluginStorage`
- **During recording:** Settings gear icon is disabled

## Defaults

| Setting | Default | Reasoning |
|---------|---------|-----------|
| Screen | Fullscreen | Simpler first experience |
| Audio | Both unchecked | No surprise audio capture |
| Quality | Light | Faster encoding |
| Resolution | 720p | Balance of quality and file size |
| Hotkey | Ctrl+Shift+R | Already established |

## Edge Cases

1. **Area mode + portal token expired:** Recording prompts user to select area again (existing behavior)
2. **Audio sources unavailable:** Toast error when recording starts (not in settings)
3. **Hotkey conflict:** Reuse existing conflict detection from global settings
4. **Recording in progress:** Disable settings gear icon

## Out of Scope

- Per-recording settings override
- Audio device selection (uses system defaults)
- Custom output directory
- Bitrate/CRF manual control

## Implementation Notes

- Reuse `SettingsSection` and `SettingsRow` components
- Reuse hotkey recorder component from global settings
- Follow existing breadcrumb navigation pattern
- Use `frontend-design` skill for UI implementation
