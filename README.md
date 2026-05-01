# jubby

PLACEHOLDER — descrição do app.

Decisões consolidadas em [`grill/decisions.md`](./grill/decisions.md).

## Stack

- Electron 33 (frame nativo, contextIsolation + sandbox)
- electron-vite (main + preload + renderer)
- Drizzle ORM + better-sqlite3 (NAPI, sem rebuild)
- ORPC via `MessagePort` (renderer ↔ main, type-safe via `import type`)
- React 19 + TanStack Router (memory history) + TanStack Query
- Tailwind v4 (dark mode class-based via `<html class="dark">`)
- Arktype pra validação de boundary
- Vitest (in-process ORPC client, DB `:memory:`)
- electron-builder + electron-updater

## Comandos

```sh
bun install
bun run dev          # electron-vite dev (HMR + DevTools detached)
bun run test         # vitest run
bun run test:watch   # vitest
bun run dist         # build + AppImage/exe pra plataforma atual
bun run db:generate  # drizzle-kit migration nova
bun run db:studio    # drizzle-kit studio
```

## Forkando

Trocar manualmente:

| Arquivo | Campo | O quê |
|---|---|---|
| `package.json` | `name` | nome do pacote |
| `package.json` | `description`, `author`, `homepage`, `repository` | metadados |
| `package.json` | `productName` | nome do app exibido |
| `package.json` | `appId` | ex.: `com.juicerq.meuapp` |
| `electron-builder.yml` | `publish.owner`, `publish.repo` | dono/repo do GitHub Releases |
| `build/icon.png` | (binário) | substitui placeholder por ícone real 1024×1024 |

## Release

SemVer manual:

```sh
npm version patch    # ou minor / major
git push --follow-tags
```

A tag dispara `.github/workflows/release.yml` que builda em paralelo no Linux (AppImage) e Windows (NSIS) e publica no GitHub Releases. Apps já instalados detectam via `electron-updater` e baixam silenciosamente — instalação na próxima saída.

## Estrutura

```
src/
  main/          # processo Electron (Node)
    db/          # drizzle + DbX domain objects + settingsContract
    ipc/         # bootstrap MessagePort
    router/      # ORPC procedures
    auto-update.ts
    index.ts
  preload/       # forwarda port pro main
  renderer/src/  # React + TanStack
tests/           # vitest + utils + todos.test.ts
build/           # icon.png placeholder
grill/           # PRD + decisions.md (registro do design)
```

## Não está incluído (decisão consciente)

- macOS (decisão: não suporta)
- Code signing (Windows mostra SmartScreen warning na primeira instalação)
- Component testing / E2E (cada fork escolhe)
- Component library (cada fork escolhe)
- Dark mode toggle UI elaborado (botão de demo na rota `/`, troque/remova)
- Observabilidade (`@juicerq/trail` aguarda subpath `better-sqlite3`)
