# Jubby

Hub de mini-apps pessoais para o system tray do Linux.

## Stack

- **Runtime:** Tauri v2
- **Backend:** Rust (mínimo necessário)
- **Frontend:** React 18 + TypeScript (strict mode)
- **Estilização:** Tailwind CSS + shadcn/ui
- **Persistência:** Arquivos JSON em `~/.local/share/jubby/`
- **Package manager:** bun

## Comandos

```bash
bun install           # Instalar dependências
bun tauri dev         # Dev mode
bun tauri build       # Build de produção
bun tsc --noEmit      # Typecheck
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

### Estrutura de plugin

```
plugins/nome/
├── index.tsx      # Apenas export do manifest
├── NomePlugin.tsx # Componente principal
├── hooks.ts       # Hooks do plugin (se houver)
├── types.ts       # Tipos do plugin (se houver)
└── components/    # Subcomponentes (se houver)
```

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

3. Criar `MeuPlugin.tsx` com o componente principal
4. Registrar em `src/plugins/registry.ts`

### Persistência no plugin

```tsx
const { data, setData, isLoading } = usePluginStorage<MeusDados>('meu-plugin', defaultValue)
```

Dados salvos automaticamente em `~/.local/share/jubby/meu-plugin.json`.

## Convenções

### Idioma / Language
- **UI texts:** Always in English (labels, buttons, descriptions, aria-labels, placeholders)
- **Code:** English (variables, functions, comments)
- **Documentation (CLAUDE.md, PRD):** Portuguese is acceptable
- **Commit messages:** English

### TypeScript
- Strict mode obrigatório
- Interfaces para dados, types para unions
- Evitar `any` - usar `unknown` se necessário

### Componentes React
- Functional components apenas
- Hooks customizados em `core/hooks/` ou dentro do plugin
- Props tipadas inline ou em arquivo `types.ts` do plugin

#### Padrão de mini-componentes

Componentes complexos podem ser divididos em mini-componentes **no mesmo arquivo** (guiado por Single Responsibility, não por contagem de linhas):

```tsx
// Componente principal primeiro - retorna composição
function MyComponent() {
  const [state, setState] = useState()

  return (
    <div>
      <MyComponentHeader />
      <MyComponentContent state={state} />
      <MyComponentFooter />
    </div>
  )
}

// Mini-componentes definidos DEPOIS do principal
function MyComponentHeader() {
  return <header>...</header>
}

function MyComponentContent({ state }: { state: State }) {
  return <main>...</main>
}

function MyComponentFooter() {
  return <footer>...</footer>
}

// Export no final
export { MyComponent }
```

**Regras:**
- Nome do mini-componente = `NomeDoComponentePrincipal` + `Parte` (ex: `PluginGridSearch`)
- Props tipadas inline ou com interface local
- Lógica/estado fica no componente principal, mini-componentes são apresentacionais

### Estilização
- Tailwind para utilitários
- shadcn/ui como base de componentes
- Tema dark como padrão
- **NUNCA usar CSS puro - sempre preferir Tailwind**

### Rust

**Tratamento de Erros**
- NUNCA usar `panic!` ou `unwrap()` em código de produção
- Usar `thiserror` para tipos de erro customizados
- Propagar erros com `?` e contexto adequado
- `expect()` apenas em invariantes impossíveis (documentar o porquê)

**Tipos**
- Preferir enums a strings para estados (status, labels)
- Usar newtypes para IDs: `struct TodoId(String)`
- Validar dados na fronteira (deserialização)

**Database**
- Sempre usar transações para operações múltiplas
- Evitar N+1 queries - usar JOINs
- Queries parametrizadas (nunca concatenar strings)

**Logging**
- Usar `tracing` crate (não `eprintln!`)
- Níveis: error/warn/info/debug/trace
- Incluir contexto estruturado

**Async**
- Timeout em operações externas (2min default para CLI, 30s para APIs)
- Não bloquear runtime sem `spawn_blocking`

**Naming**
- Constants para strings hardcoded
- snake_case para funções/variáveis
- PascalCase para tipos/traits

**Organização**
- Comandos IPC em `commands.rs`
- Storage em `storage/`
- Erros tratados e retornados como Result

## Filosofia de Código

### Princípios Core

**DRY (Don't Repeat Yourself)**
- Extrair abstração quando um padrão aparece 2+ vezes
- Não antecipar duplicação que ainda não existe

**YAGNI (You Aren't Gonna Need It)**
- Implementar apenas o necessário para o requisito atual
- Não adicionar features "para o futuro"

### Princípio Secundário

**Single Responsibility**
- Componente faz uma coisa bem feita
- Dividir quando responsabilidades se misturam, não por contagem de linhas

### Regras Concretas

**Comentários**
- Código deve ser auto-explicativo através de nomes claros de variáveis e funções
- NUNCA usar comentários para explicar o que o código faz - se precisa explicar, refatore
- Comentários apenas para:
  - Explicar o **porquê** de algo não-óbvio (ex: workaround para bug, limitação de API)
  - Documentar comportamentos importantes que seriam fáceis de esquecer
  - TODOs com contexto relevante

**Ícones**
- Sempre usar `lucide-react`
- SVGs customizados apenas quando explicitamente pedido pelo usuário

**Estilização**
- Tailwind para tudo
- CSS variables apenas para compatibilidade com shadcn/ui
- Usar `cn()` de `lib/utils` para classes condicionais
- **Exceção:** `::-webkit-scrollbar` fica em CSS (pseudo-elementos não suportados por Tailwind)

**Hooks**
- Extrair para hook reutilizável quando pattern aparece 2+ vezes

**Imports (direção única)**
```
shared/     ← base, sem dependências internas
core/       ← pode usar shared/
plugins/    ← pode usar core/ e shared/
```
- Nunca `core/` importa de `plugins/`
- Nunca `shared/` importa de `core/`

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

## Regras para o Claude

- **NUNCA** executar `bun tauri dev` - o usuário roda manualmente
- Use `cargo check` para verificar compilação do Rust
- Use `bun tsc --noEmit` para verificar TypeScript
