---
name: Obsidian Emerald
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#20201f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#cfc4c5'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#988e90'
  outline-variant: '#4c4546'
  surface-tint: '#c6c6c6'
  primary: '#c6c6c6'
  on-primary: '#303030'
  primary-container: '#000000'
  on-primary-container: '#757575'
  inverse-primary: '#5e5e5e'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#95d3ba'
  on-tertiary: '#003829'
  tertiary-container: '#000000'
  on-tertiary-container: '#44806b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#b0f0d6'
  tertiary-fixed-dim: '#95d3ba'
  on-tertiary-fixed: '#002117'
  on-tertiary-fixed-variant: '#0b513d'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  h1:
    fontFamily: Pixelify Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.02em
  h2:
    fontFamily: Pixelify Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  ui-label:
    fontFamily: Pixelify Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 16px
  gutter: 12px
---

## Brand & Style

This design system establishes a high-fidelity environment that merges the precision of early computing with the luxury of modern dark-mode productivity interfaces. The brand personality is "Technological Elegance"—it is authoritative, focused, and whisper-quiet. The target audience includes developers, architects, and data analysts who value a "low-light" workspace that minimizes eye strain while maintaining a distinct, soul-filled aesthetic.

The design style is a hybrid of **Minimalism** and **Retrofuturism**, characterized by sharp edges and a rigorous 4px grid alignment. Unlike playful pixel-art styles, this system uses pixelation as a structural motif for professional information density. It employs thin, high-contrast borders and subtle glassmorphism to create a "monolith" effect, where the application feels like a single piece of dark glass etched with light.

## Colors

The palette is anchored in absolute black (`#000000`) to maximize the contrast of the green accents and provide the "deepest" possible workspace. 

- **Primary Canvas:** Absolute black for the main background to anchor the UI.
- **The Emerald Accent:** A vibrant but professional emerald (`#10B981`) used sparingly for active states, primary actions, and critical data points.
- **Deep Forest:** A muted forest green (`#064E3B`) serves as a low-signal background for chips or selected list items, ensuring the interface remains dark and focused.
- **Monochrome Neutrals:** A hierarchy of grays from `#1A1A1A` (surface overlays) to `#222222` (borders) defines the structural architecture without introducing hue shifts that might distract from the green accents.

## Typography

This system uses a strategic pairing of **Pixelify Sans** and **Inter**. 

- **Pixelify Sans** is utilized for all UI headers, labels, and interactive triggers (buttons, menu items). This injects the "pixel art soul" into the interface's structural points. It should always be used in sentence case or uppercase to maintain a professional look.
- **Inter** is the functional workhorse for body text, descriptions, and data input. Its neutrality balances the personality of the pixel font, ensuring that long-form content remains highly readable and the tool feels like a serious productivity instrument.
- **Visual Hierarchy:** Large headers use thicker weights, while small UI labels use increased letter spacing to ensure the pixelated glyphs remain legible at 12px.

## Layout & Spacing

The layout is built on a **Strict 4px Grid**, reflecting the pixel-based nature of the typography. 

- **The Shell:** A fixed 960x640 desktop canvas divided into functional panes.
- **Layout Model:** A sidebar-driven fluid inner grid. Sidebars are fixed at 200px, while the main content area expands.
- **Rhythm:** Spacing follows a linear progression of 4px. Use 16px (md) for standard internal padding and 8px (sm) for grouping related elements.
- **Alignment:** All elements must align to the pixel grid. Avoid odd-numbered spacing to prevent "sub-pixel" rendering blur, keeping the edges of buttons and containers razor-sharp.

## Elevation & Depth

This system avoids traditional ambient shadows in favor of **Tonal Layering** and **Luminous Borders**.

- **Surface Tiers:** Depth is achieved by shifting the background color slightly. Level 0 is absolute black. Level 1 (modals/sidebars) is `#0A0A0A`. Level 2 (cards/popovers) is `#121212`.
- **Luminous Borders:** Instead of shadows, use 1px solid borders. For inactive elements, use `#222222`. For focused or active elements, use a "glow" border: a 1px emerald line (`#10B981`) with a very tight 2px blur of the same color.
- **Glassmorphism:** Use sparingly for floating panels (like command palettes). Apply a `background: rgba(10, 10, 10, 0.8)` with a `backdrop-filter: blur(12px)`. This creates a sense of high-fidelity glass stacked over the black void.

## Shapes

The shape language is strictly **Sharp (0px)**. 

Every UI element—buttons, input fields, cards, and windows—must have 90-degree corners. This reinforces the pixelated soul of the design system and suggests a surgical precision. When elements are nested, they maintain their sharp corners, creating a "block-based" architectural feel. Avoid all forms of rounding, including standard browser-default focus rings.

## Components

- **Buttons:** Primary buttons feature a solid Emerald (`#10B981`) background with black text in Pixelify Sans. Secondary buttons use a 1px emerald border with no fill. All hover states should trigger a subtle internal glow or a slight increase in brightness.
- **Input Fields:** Rectangular boxes with a `#1A1A1A` fill and a `#222222` border. On focus, the border changes to Emerald. Text inside inputs uses Inter for clarity.
- **Lists:** High-density rows with 1px bottom borders. Selected states utilize a Forest Green (`#064E3B`) background and a 2px left-accent bar in bright Emerald.
- **Chips/Tags:** Small, sharp-edged boxes with Forest Green backgrounds and Emerald text in Pixelify Sans (10px).
- **Glass Modals:** Large center-screen overlays with 1px border (`#333333`) and high-strength backdrop blur to separate the modal from the complex data grid behind it.
- **Scrollbars:** Custom ultra-thin (4px) emerald tracks without arrows, visible only on hover to maintain the clean, dark aesthetic.