---
name: jubby-frontend
description: Jubby frontend conventions and UI constraints. Use when implementing or editing React/TypeScript UI, styling with Tailwind/shadcn, or enforcing UX rules.
---

# Jubby Frontend

## Overview

Apply these rules when changing React/TypeScript UI or Tailwind styling.

## React and TypeScript

- Use functional components only.
- TypeScript strict; avoid `any` (use `unknown` if needed).
- Use interfaces for data shapes and types for unions.
- If splitting a component, keep mini-components in the same file and define them after the main component.
- Mini-component naming: `MainComponentPart`.
- Put hooks in `core/hooks/` or the plugin folder; extract when a pattern appears 2+ times.
- UI text must be English (labels, buttons, placeholders, aria-labels).

## Styling and UX

- Use Tailwind utilities; avoid custom CSS.
- Exception: `::-webkit-scrollbar` can live in CSS.
- Use shadcn/ui as the base component set.
- Use `cn()` from `lib/utils` for conditional classes.
- Dark theme is the default.
- Popover: ~400x350, no decorations, closes on blur.
- Navigation: Grid -> Plugin -> Grid.
- Icons: use `lucide-react`.
