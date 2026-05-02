# jubby

App de tarefas desktop (Electron + React) com estética CRT/terminal. Fork do "personal desktop app template".

## Documentos

| Arquivo | O quê |
|---|---|
| `grill/` | PRDs por feature + `DECISIONS.md` (log de Q&A das sessões de grill). |
| `src/renderer/CLAUDE.md` | Regras específicas do renderer. |

## Convenções específicas do projeto

- Mensagens de erro, toasts e observability em pt-br.
- Named exports apenas, sem barrel files.
- `import type` explícito em qualquer import que cruza boundary main↔renderer.

(Restante das convenções vem do CLAUDE.md global.)
