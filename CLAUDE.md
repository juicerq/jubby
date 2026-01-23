# Jubby

Personal Linux system tray hub for mini apps (Tauri).

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

## Skills (use only if relevant)

- `.claude/skills/jubby-architecture/SKILL.md` for codebase map.
- `.claude/skills/jubby-frontend/SKILL.md` for React/TypeScript/UI conventions.
- `.claude/skills/jubby-plugins/SKILL.md` for plugin structure and storage.
- `.claude/skills/jubby-rust-backend/SKILL.md` for backend rules.
- `.claude/skills/jubby-tracing/SKILL.md` for JSONL tracing.
