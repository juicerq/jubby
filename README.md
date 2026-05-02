# jubby

Gerenciador de tarefas desktop com estética CRT. Local — dados em `userData/store/` do Electron, sem servidor, sem login.

Stack: Electron 33 + electron-vite, ORPC sobre MessagePort, React 19 com TanStack Router/Query, Tailwind v4, Arktype, JSON store (sem native modules).

## Comandos

```sh
bun install
bun run dev          # electron-vite (HMR)
bun run test         # vitest
bun run check        # lint + format
bun run dist         # build + AppImage/exe da plataforma atual
bun run dist:linux   # AppImage
bun run dist:win     # NSIS
```

## Release

```sh
npm version patch
git push --follow-tags
```

A tag dispara `.github/workflows/release.yml`, que builda em paralelo no Linux (AppImage) e Windows (NSIS) e publica no GitHub Releases. Apps instalados detectam via `electron-updater`, baixam em background e aplicam na próxima saída. Sem code signing — a única integridade da update é o SHA512 que `electron-builder` grava no `latest.yml`.

## Por quê

- **JSON em vez de SQLite.** Tentei e reverti. Os custos (ABI dance por versão de Electron, postinstall hook, prebuilds toda vez que troca dev↔test, `bun test` impedido, drizzle-kit + migrations duplicando o truth do schema) pagavam capacidade que app pessoal não usa: joins, FTS, índices em milhares de registros, concorrência multi-processo. Hoje cada domínio é um arquivo (`folders.json`, `tasks.json`, `settings.json`) com envelope `{ version, data }` validado por arktype, write atômico (`writeFile + rename`) e fila serial por arquivo. Migrações em TS, não SQL.
- **Sem code signing.** Windows mostra SmartScreen warning na primeira instalação. Aceito — app pessoal, sem orçamento pra cert.
- **Sem macOS.** Sem hardware nem Developer ID. Entregar sem signar no macOS é pior que não entregar.

## Não suportado

macOS, .deb, .rpm, MSI, arm64, code signing.
