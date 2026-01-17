# QuickClip Plugin Design

## Overview

Plugin de gravacao rapida para compartilhar videos com minima friccao. O fluxo principal e: **Hotkey → Grava → Hotkey → Clipboard → Ctrl+V no Discord**.

**Problema resolvido:** Eliminar os 7+ passos do OBS (abrir, configurar, gravar, parar, encontrar arquivo, arrastar pro Discord) para um fluxo de 3 passos.

**Principios:**
- Gravacao inicia em <1 segundo apos hotkey
- Video no clipboard automaticamente ao parar
- Zero janelas/dialogos no caminho critico
- Tudo salvo para acesso posterior

## Fluxo de Uso

### Gravacao rapida (hotkey)
1. Pressiona hotkey global (ex: `Ctrl+Shift+R`)
2. Se primeira vez: mostra seletor de regiao/janela/tela
3. Se nao: usa ultima configuracao
4. Overlay vermelho aparece (invisivel na gravacao)
5. Pressiona mesma hotkey para parar
6. Video vai pro clipboard + salva na pasta do plugin
7. Cola no Discord com Ctrl+V

### Via tray (quando quer mudar config)
1. Abre Jubby → QuickClip
2. Ve grid de gravacoes anteriores
3. Pode: iniciar nova gravacao, mudar configuracoes, copiar video antigo pro clipboard

### Configuracoes disponiveis
- Modo de captura: tela inteira / janela / regiao
- Audio: nenhum / sistema / microfone / ambos
- Qualidade: leve (otimizado pra Discord 25MB) / alta

## Arquitetura Tecnica

### Frontend (React no popover)
- Tela principal: grid de thumbnails das gravacoes
- Hover no thumbnail: preview animado (GIF ou video tag)
- Click: menu de acoes (copiar pro clipboard, abrir pasta, deletar)
- Area de configuracoes: toggles para modo/audio/qualidade
- Botao para iniciar gravacao com config atual

### Backend (Rust/Tauri)
- Captura de tela via bibliotecas nativas do sistema (ex: `scrap`, `xcap` ou integracao com pipewire/wlroots no Linux)
- Encoding com ffmpeg (provavelmente via CLI ou binding)
- Overlay como janela Tauri separada (com flag para excluir da captura)
- Hotkey global via Tauri's global shortcut API
- Clipboard de video via APIs nativas

### Persistencia
- Videos em `~/.local/share/jubby/quickclip/videos/`
- Metadata em `~/.local/share/jubby/quickclip.json` (lista de gravacoes com timestamp, duracao, config usada)

### Capabilities do plugin
```typescript
capabilities: {
  canCreateWindow: true,  // para o overlay
  nativeFeatures: ['screen-capture', 'global-shortcut', 'clipboard-video']
}
```

## Interface do Plugin (Popover)

### Estado inicial (sem gravacoes)
- Mensagem de onboarding simples
- Botao grande "Start Recording"
- Indicador da hotkey configurada

### Estado com gravacoes (grid)
- Grid 2x3 ou 3x3 de thumbnails (depende do tamanho)
- Cada thumbnail mostra: preview estatico, duracao no canto
- Hover: preview animado (primeiros 2-3 segundos em loop)
- Click: copia pro clipboard (feedback visual de "copiado!")
- Click secundario ou icone: menu com mais acoes (abrir arquivo, deletar)

### Header do plugin
- Breadcrumb padrao do Jubby
- Botao de configuracoes (engrenagem)
- Botao "New Recording" (ou hotkey hint)

### Tela de configuracoes
- Modo de captura: radio buttons (Fullscreen / Window / Region)
- Audio: checkboxes (System Audio / Microphone)
- Qualidade: toggle (Light / High Quality)
- Hotkey: input para customizar

## Overlay de Gravacao

### Visual
- Circulo vermelho pequeno (~32px) com animacao de pulso sutil
- Posicao: canto superior direito da tela (ou configuravel)
- Semi-transparente, nao intrusivo
- Tooltip no hover: "Press [hotkey] to stop"

### Comportamento tecnico
- Janela Tauri separada, sempre no topo
- Flag `set_content_protection(true)` ou equivalente para excluir da captura
- Aparece instantaneamente ao iniciar gravacao
- Desaparece ao parar

### Fallback
Se nao conseguir excluir da captura em algum ambiente, posicionar fora da area de gravacao (quando for regiao/janela) ou dar opcao de desativar.
