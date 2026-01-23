# Jubby

Personal Linux system tray hub for mini apps (Tauri).

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Quick facts

- Package manager: bun (do not use npm/pnpm)
- Frontend: React 18 + TypeScript (strict), Tailwind + shadcn/ui
- Backend: Tauri v2 with Rust
- Data lives in `~/.local/share/jubby/`

## Commands (safe)

- `bun install`
- `bun tsc --noEmit`
- `cargo check`
- `bun tauri build`
- Do not run `bun tauri dev` (user runs it manually)

## Always-on rules

- UI text is English.
- Prefer Tailwind utilities; avoid custom CSS (except `::-webkit-scrollbar` when needed).
- Use `lucide-react` for icons.
- NEVER use barrel imports.

## Skills (use only if relevant)

- `.claude/skills/jubby-architecture/SKILL.md` for codebase map.
- `.claude/skills/jubby-frontend/SKILL.md` for React/TypeScript/UI conventions.
- `.claude/skills/jubby-plugins/SKILL.md` for plugin structure and storage.
- `.claude/skills/jubby-rust-backend/SKILL.md` for backend rules.
- `.claude/skills/jubby-tracing/SKILL.md` for JSONL tracing.
