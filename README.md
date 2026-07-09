# jubby

A desktop task manager with a CRT terminal aesthetic. Fully local — data lives in Electron's `userData/store/`, no server, no login, no sync.

![Jubby](docs/screenshot.png)

## Why

I wanted a task manager that opens instantly, works offline, and holds exactly my mental model of work — not a SaaS with boards, sprints, and an account. I use it daily as the single source of what I'm doing: work tasks, personal errands, and ideas for my own projects, each in its own folder. The core constraint is the **on-going task**: a global singleton for the one thing I'm working on right now. Starting another task demotes the previous one back to `todo`, so the app always answers "what am I doing?" with exactly one row pinned at the top.

The CRT look is not a skin over a normal app — power-on animation, scanline typography, a pixel-art AI companion in the sidebar that watches app events and reacts (Groq via Vercel AI SDK, key stored in the OS keychain via `safeStorage`), and a completion heatmap rendered as terminal blocks.

## Features

- **Folders** — every task lives in exactly one folder ("where it lives").
- **Tags** — first-class, cross-cutting labels across folders ("what it's like"), with color and filtering.
- **On-going task** — global singleton, pinned and highlighted; task state (`todo → on-going → done`) is derived from timestamps, not stored flags.
- **Grill viewer** — renders the markdown PRDs and decision logs from `grill/` inside the app.
- **AI entity** — a pixel cat that reacts to task events, idle time, and window focus with expressions and short messages.
- **Completion heatmap** — activity at a glance in the sidebar.
- **Auto-update** — `electron-updater` against GitHub Releases.

## Stack

Electron 33 + electron-vite, ORPC over MessagePort, React 19 with TanStack Router/Query, Tailwind v4, Arktype, JSON store (no native modules).

## Development

```sh
bun install
bun run dev     # electron-vite with HMR
bun run test    # vitest
bun run check   # lint + format
bun run dist    # installer for the current platform (dist:linux, dist:win)
```

## Release

```sh
npm version patch
git push --follow-tags
```

The tag triggers a GitHub Actions workflow that builds the Linux AppImage and the Windows NSIS installer and publishes both to GitHub Releases. Installed apps pick the release up via `electron-updater`, download it in the background, and apply it on next quit. Update integrity is the SHA512 that `electron-builder` writes to `latest.yml`.

## Design decisions

- **JSON store instead of SQLite.** Tried SQLite, reverted. A native module in Electron meant ABI rebuilds per version, postinstall hooks, and a blocked `bun test`, while drizzle-kit migrations duplicated the schema's source of truth — all paying for joins, FTS, and indexes a personal app never uses. The store is now JSON files with a `{ version, data }` envelope validated by arktype, atomic writes (`writeFile` + `rename`), and a serial write queue per file. Migrations are TypeScript functions.
- **Task state is derived, not stored.** There is no `done` or `status` field: `completedAt` means done, else `startedAt` means on-going, else todo. The timestamps the features already need (`startedAt` pins the on-going task, `completedAt` feeds the heatmap) double as the state, so nothing has to be kept in sync.
- **No code signing, no macOS.** Windows shows a SmartScreen warning on first install — accepted for a personal app with no budget for a certificate. macOS isn't shipped at all: without hardware or a Developer ID, an unsigned macOS build is worse than none. Also out of scope: .deb, .rpm, MSI, arm64.
