---
name: deploy-process
description: Faz deploy completo do Jubby (commit pendente → bump → tag → CI release → instala AppImage local). Trigger quando o usuário pedir "manda pra prod", "deploy", "publica", "lança versão nova", "bumpa e instala" ou variações.
---

# Deploy Jubby

Pipeline real (não inventar comandos):

1. CI faz build de Linux + Windows ao push de tag `v*` via `.github/workflows/release.yml`.
2. Release publicado no GitHub: `gh release list`.
3. Instalação local Linux mora em `~/Applications/Jubby.AppImage`.

## Passos

### 1. Pré-flight

- `git status` — confirmar branch `main` e ver mudanças pendentes.
- Se tiver mudança não-commitada, commitar com mensagem no estilo do log (`feat(scope): ...`, `fix(scope): ...`, `chore: ...`). Pre-commit hook roda `bun run check` (oxlint + tsgolint + tsc + jscpd). NÃO usar `--no-verify`.
- `bun run test` deve passar antes de bumpar.

### 2. Bump de versão

- Versão atual em `package.json` campo `version`.
- Incrementar patch por padrão (`0.1.1` → `0.1.2`). Subir minor só se o usuário pedir ou se a mudança for grande.
- Commit dedicado: `chore: bump version to X.Y.Z` (já é a convenção do repo).

### 3. Tag + push

```
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

A tag `v*` dispara o workflow `release.yml`. Sem tag, não tem release.

### 4. Esperar CI

- `gh run list --workflow=release.yml --limit 1` para pegar o ID.
- `gh run watch <id> --exit-status` em `run_in_background=true` (o build de Windows + Linux leva ~5–10 min). Não dormir esperando.
- Se falhar: `gh run view <id> --log-failed` e corrigir antes de retentar.

### 5. Baixar e instalar AppImage

Quando o release publicar:

```
gh release download vX.Y.Z --pattern "*.AppImage" --output ~/Applications/Jubby.AppImage --clobber
chmod +x ~/Applications/Jubby.AppImage
```

`--clobber` substitui o binário antigo. O caminho `~/Applications/Jubby.AppImage` é o que o usuário já tem instalado — não criar outro lugar.

### 6. Confirmar

- `~/Applications/Jubby.AppImage --version` ou abrir o app.
- Reportar versão instalada + URL do release.

## Regras

- Nunca pular etapas (commit → bump → tag → CI → instala). O AppImage local só atualiza pelo release do GitHub; não existe atalho via `bun run dist` no fluxo do usuário.
- Se o app estiver aberto durante a substituição do AppImage, avisar o usuário pra fechar e reabrir.
- Se o usuário não autorizou push explicitamente, perguntar antes de criar a tag (push de tag dispara CI e cria release público).
- Versões já lançadas não são reutilizadas. Se `vX.Y.Z` já existe como tag, bumpar de novo.

## Manutenção

Sempre que o processo de deploy mudar (workflow, builder config, caminho de instalação, ferramenta de release, etc.), atualizar este SKILL.md no mesmo PR. Skill desatualizada vira pegadinha silenciosa.
