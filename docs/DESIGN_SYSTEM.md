# MANICAI design system

MANICAI's interface sits around a full-screen 3D model. The panels are frosted glass so the model
reads through them, the type is small and dense like a drawing's annotation, and colour is kept for
meaning: the accent for what you can act on, semantic colours for checks, and data colours for the
model. Round 08 gathered the styles into the tokens below; `src/ui/styles.css` is the source.

## Tokens

All colours, radii and motion come from the `:root` block of `styles.css`. Components use the
tokens, never a literal colour. The exceptions are the data colours (below), which describe the
model.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f3f3f5` | Behind the 3D view |
| `--ink`, `--ink-2`, `--ink-3`, `--ink-4` | `#1d1d1f` → `#a1a1a6` | Text: primary, secondary, labels and notes, disabled and units |
| `--line`, `--line-2` | 7 % and 12 % black | Hairlines: inside a group, between groups |
| `--glass`, `--glass-strong`, `--glass-border` | 62 % and 82 % white | Panels and toolbars; menus, sheets and toasts |
| `--sheet`, `--sheet-solid` | 96 % and opaque warm white | Large overlays that hold tables (Compare); menus, which sit over panel text |
| `--surface` | `#fff` | Text inputs and small buttons |
| `--card` | 2.5 % black | A quiet block inside a panel (section diagram, suggested moves) |
| `--hover`, `--pressed` | 4.5 % and 6 % black | Hover and selected tints on menu items and cards |
| `--accent`, `--accent-soft` | `#0a84ff`, 10 % | Fills, selection, focus ring, chart marks |
| `--accent-ink` | `#0064cc` | Accent used as text (selected chips, links) |
| `--ok`, `--ok-soft` | `#1e7a4a` | A check that passes, the best value in a comparison |
| `--warn`, `--warn-soft` | `#9a5700` | A check to look at |
| `--err`, `--err-soft` | `#c8102e` | A failed check, a destructive action |
| `--viz-poor`, `--viz-fair`, `--viz-good` | red, amber, green | Bars and points in the study charts |
| `--radius` | 18 px | Panels and sheets; controls use 8–12 px |
| `--shadow` | three layers | Glass panels |
| `--ease` | `cubic-bezier(.22, 1, .36, 1)` | Every transition and entrance |
| `--font`, `--mono` | system UI, system mono | Text; ids, units and numbers that line up |

Text colours (`--ink-3` and darker, `--accent-ink` and the semantic colours) meet 4.5:1 on the glass panels and the page background. Never use them for decoration.

## Type

13 px base, 11.5 px for notes (`.small`), 10.5 px uppercase labels with 0.04–0.08 em tracking
(`.sub-label`, `.menu-title`), 600 weight for headings and values. Numbers that line up use
`tabular-nums`. Ids such as `T1-104-R12-S07` and file extensions use `--mono`.

## Components

| Component | Class | Notes |
|---|---|---|
| Glass | `.glass` | The base for toolbar, panels, menus, sheets and toasts. |
| Panel | `.panel.left`, `.panel.right` | 304 and 292 px, scroll inside. |
| Section | `Section` in `controls.tsx` | Title, one-line summary of the current state, optional round badge; collapsed sections still show the summary. |
| Number and length controls | `NumberControl`, `LengthControl` | A slider with a typed value; units follow the project's m / ft setting; a hint line explains the limit or the source. |
| Segmented | `Segmented` | Two to seven exclusive choices; `size="sm"` inside panels. |
| Chip | `.chip`, `.chip.on` | Toggles in the toolbar and view bar. |
| Small button | `.btn-sm`, `.btn-sm.wide`, `.btn-sm.on` | Actions inside panels. |
| Menu | `.menu`, `.menu-item`, `.menu-title`, `.menu-sep` | Close on Escape or a click outside. Each export item shows its file extension. |
| Sheet | `.sheet-backdrop`, `.sheet` | Modal content (About and shortcuts). Escape or a click outside closes it. |
| Toast | `.toast` | One line of result. It stays up for at least 3.2 s, and longer for longer text. |
| Checks list | `.warnings li.ok / .warn / .error` | Icon, bold label, plain detail. |
| Metric | `Metric`, `.metric-value.ok / .warn / .bad` | A big number with a sub-label. |
| Error panel | `.crash` | Shown in place of a part of the app that failed, with a way back. |

## States

- **Hover**: `--hover` tint, no movement.
- **Press**: scale to 0.94–0.98 for 0.2 s.
- **Selected**: `--accent-soft` fill with accent text, or `--pressed` fill on cards.
- **Focus**: a 2 px accent outline, offset 2 px, on every button, input and link reached by keyboard.
- **Disabled**: 35 % opacity and the default cursor; where there is a reason (baseball, a fixed NFL field), a `title` or hint says it.

## Motion

Panels slide in once at load, and menus and sheets pop in over 0.22 s. Nothing else animates.
With the system's reduced-motion setting, all animation and transitions are cut to nothing.

## Data colours

The model's colours live in `src/viewport/palette.ts`, `Architecture.tsx` and `Systems.tsx`. They
are the same in the 3D view, the legends, the section diagram and the exports:

- **C-value**: red below the minimum, amber below the target, green at the target, teal above.
- **Distance**: blue near, warm grey at mid-range, orange far.
- **View quality**: red, amber, green, teal from poor to excellent.
- **Sun**: slate in shade to yellow in sun. The pitch map uses a slate → pale blue → yellow ramp stretched between the pitch's least and most sun.
- **Tiers and classes**: greys by tier, with gold for club and blue for wheelchair and companion positions.
- **Systems**: one hue per system (lighting, HVAC, electrical, plumbing, AV / IT, broadcast, service).

Each colouring has a legend in the right panel.

## Writing

Name things by what an architect recognises: "first-row distance", not "ring offset". Use the active
voice and say exactly what happens: "Save as preset", then "Saved "Bowl B" to My presets in this
browser". Each study and each check says what method it used and what it leaves out. MANICAI never
claims code compliance, certification or engineering it has not done.
