# Jubby

Hub de mini-apps pessoais para o system tray do Linux.

## Stack

- **Runtime:** Tauri v2
- **Backend:** Rust (mínimo necessário)
- **Frontend:** React 18 + TypeScript (strict mode)
- **Estilização:** Tailwind CSS + shadcn/ui
- **Persistência:** Arquivos JSON em `~/.local/share/jubby/`
- **Package manager:** pnpm

## Comandos

```bash
pnpm install          # Instalar dependências
pnpm tauri dev        # Dev mode
pnpm tauri build      # Build de produção
pnpm tsc --noEmit     # Typecheck
```

## Arquitetura

```
src/
├── core/
│   ├── components/   # Layout, Grid, PluginShell
│   ├── hooks/        # usePluginStorage, useNavigation, useWindow
│   ├── context/      # PluginContext, WindowContext
│   └── types.ts      # PluginManifest, WindowType, etc.
├── plugins/
│   ├── registry.ts   # Array de plugins registrados
│   └── [plugin]/     # Cada plugin em sua pasta
└── shared/
    ├── components/   # Componentes shadcn customizados
    └── lib/          # Utilitários

src-tauri/src/
├── main.rs           # Entry point
├── tray.rs           # System tray
├── commands.rs       # Comandos IPC
├── storage.rs        # Persistência JSON
└── window.rs         # Gerenciamento de janelas
```

## Sistema de Plugins

### Criar novo plugin

1. Criar pasta `src/plugins/[nome]/`
2. Criar `index.tsx` com manifest:

```tsx
import { PluginManifest } from '@/core/types'
import { MeuPlugin } from './MeuPlugin'

export const MeuPluginManifest: PluginManifest = {
  id: 'meu-plugin',
  name: 'Meu Plugin',
  icon: '🔧',
  component: MeuPlugin,
  version: '1.0.0',
}
```

3. Registrar em `src/plugins/registry.ts`

### Persistência no plugin

```tsx
const { data, setData, isLoading } = usePluginStorage<MeusDados>('meu-plugin', defaultValue)
```

Dados salvos automaticamente em `~/.local/share/jubby/meu-plugin.json`.

## Convenções

### TypeScript
- Strict mode obrigatório
- Interfaces para dados, types para unions
- Evitar `any` - usar `unknown` se necessário

### Componentes React
- Functional components apenas
- Hooks customizados em `core/hooks/` ou dentro do plugin
- Props tipadas inline ou em arquivo `types.ts` do plugin

### Estilização
- Tailwind para utilitários
- shadcn/ui como base de componentes
- Tema dark como padrão
- Evitar CSS custom - preferir Tailwind

### Rust
- Código mínimo - apenas o necessário para Tauri
- Comandos IPC em `commands.rs`
- Storage em `storage.rs`
- Erros tratados e retornados como Result

## UX

- **Popover:** ~400x350px, sem decorações, fecha ao perder foco
- **Navegação:** Grid → Plugin → Grid (botão voltar)
- **Plugins simples:** Renderizam dentro do popover
- **Plugins avançados (futuro):** Podem requisitar overlay/janela via capabilities

## Plugin Todo (primeiro plugin)

- CRUD de tarefas
- Ordenação: mais recente primeiro
- Deleção: dois cliques (primeiro mostra check, segundo confirma)
- Persistência automática

## Arquivos importantes

- `ralph/prd.json` - Product Requirements Document
- `src/core/types.ts` - Tipos centrais do sistema
- `src/plugins/registry.ts` - Lista de plugins ativos
