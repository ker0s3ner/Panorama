# Console design system

The default shell follows operations-console conventions (Palantir Gotham and
Foundry, Anduril Lattice): the map is full-bleed, and everything around it is
flat, graphite and hairline-bordered. The legacy **Cyber** theme (DISPLAY > HUD >
Layout) is unchanged and is excluded from every rule below.

## Layout

| Region | Owner | Notes |
| --- | --- | --- |
| App bar (44px) | `#title-bar`, `#style-indicator`, `#top-center-actions` | Brand left, style + globe actions right, REC time centered |
| Left / right rails | `leftPanelRail.js`, `rightPanelRail.js` | Start below the app bar (`CONSOLE_CHROME_TOP_PX`) and stop above the status bar |
| View card | `.hud-top-left` | Mode and AI summary, centered under the app bar |

## Tokens (`foundation.css`)

- Surfaces: `--bg-dark`, `--surface-1/2/3`, `--glass-bg` (94% opaque, no blur).
- Borders: `--glass-border` / `--glass-border-hover` are hairlines of one grey.
- Accent: `--accent` (#4c90f0), the only decorative color.
- State: `--signal-ok`, `--signal-warn`, `--signal-danger`. Never decorative.
- Marking: `--marking` for the classification strip.
- Shape: `--panel-radius` and `--btn-radius` are 2px. No pills.
- Chrome sizes: `--banner-h`, `--appbar-h`, `--statusbar-h`.

## Rules

1. Sans (Inter) for labels and prose; mono (JetBrains Mono) only for data.
2. Micro-labels are 10px, 600, uppercase, 0.09em tracking (`--gv-label`).
3. No glow, no text-shadow, no `backdrop-filter`, no corner brackets.
4. Selected means a 2px accent edge and a faint blue fill, not a lit border.
5. Emoji glyphs in rows render monochrome; color is reserved for data.

## Where things live

`src/ui/styles/gotham.css` re-skins components and imports before `cyber.css`.
Component files keep geometry and behavior. The scope (circular viewport) mask
now defaults off; it stays available under DISPLAY > Scope and via `sc=1`.
