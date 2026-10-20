# Design System

## World

An editorial index sheet for a block-pixel studio. The page behaves like a printed specimen: warm paper, a measured mark, registration corners, exposed coordinates and a small technical data layer. The pixel art is not decoration; it is the event.

The second event is a **specimen turntable**: six concept studies turn as rigid plates in a shallow cylinder, then flip to reveal a paper title card. The ring is geometry, not a glossy 3D toy.

## Color

| Token | Value | Use |
|---|---|---|
| Paper | `#F7F5EF` | page ground |
| Ink | `#191919` | type, rules, cells, dark fields |
| Signal orange | `#F26A35` | CTA, marker cells, active state, a few accents |
| Soft paper | `#ECE7DC` | card fronts / carousel flip face / quiet surface |
| Muted ink | `#5D574F` | secondary copy; checked for readable contrast on paper |
| Rule | `rgba(25,25,25,.18)` | hairlines and registration marks |

No gradients, glass, decorative blur or tinted shadows. Elevation is a single border or a flat ink field; never a border plus a wide shadow. Carousel depth comes from perspective, scale, rotation and opacity only.

## Type

- **Display / body:** Bricolage Grotesque (self-hosted TTF), with PingFang SC / Microsoft YaHei / Noto Sans SC for Chinese. The Chinese fallback is intentional; it keeps the display sans contemporary rather than turning the page into a pixel-font costume.
- **Data / micro-labels:** Silkscreen (self-hosted TTF), 7–10px, used for coordinates, file metadata, index numbers and the “OPEN” marks.
- Display tracking stops at `-0.036em`; body measure maxes around 65ch. Headings are short, declarative, and never preceded by an eyebrow.
- The carousel back face uses the display face for the title and the body face for the subtitle; no text is placed on a rotating image.

## Grid & spacing

- Desktop: 12 columns, `clamp(16px,1.8vw,28px)` gutter, shell max 1420px.
- Hero: copy columns 1–6, art columns 7–12. The art is the largest object; there is no visible playback console.
- Sections: ruled top line, `clamp(82px,9vw,138px)` vertical padding; Works uses a reduced `48–68px / 56–82px` padding so the carousel is one screen, not four rows.
- Works: compact one-line heading, then a single 860px-wide carousel stage, caption and `01–06` index.
- Borders are 1px. Controls are square. Radii are 0; there are no rounded cards.

## First viewport

At 1440×900 the hero fits within 900px:

- absolute header with brand, four anchor links, volume/date;
- H1 “每一格，都算数。” at columns 1–6 with a single orange square as the final punctuation;
- short lede and one primary CTA;
- measured artwork at columns 7–12, about 533×600 CSS px, with corner registration marks and coordinate line;
- `THE MARK` caption and source note directly below the art;
- no phase strip, no playback buttons, no progress track, no strength selector.

The artwork is a focusable button-like region: click / Enter replays; Space pauses and resumes while it has focus. The phase label is an invisible live region, not a visible readout.

## Motion

One authored hero timeline, 5.6 seconds at medium strength:

1. **Awakening** (1.05s) — blocks appear at deterministic scatter positions, opacity and a small drift.
2. **Converging** (1.65s) — blocks follow quadratic arcs toward a halo around their targets.
3. **Outlining** (1.35s) — silhouette cells arrive first; interior cells follow.
4. **Rearranging** (0.85s) — a small interior subset moves out and back; the silhouette remains readable.
5. **Settling** (0.7s) — all cells return to their fixed targets; the original B-derived image takes over.
6. **Complete / interactive** — no animation loop runs at rest. Pointer or touch disturbance reopens the canvas only while active, then returns to the static image.

Motion is time-based (`performance.now`) with one `requestAnimationFrame` loop; pause freezes the clock, resume continues it, replay resets the run. No duplicate loops or stacked canvases.

The carousel is a separate, viewport-gated loop:

- **Auto rotation:** 14 seconds per revolution, only while the stage is in view and idle.
- **Pause:** pointer hover, keyboard focus, touch contact, dragging, flipping and page visibility stop the loop.
- **Resume:** after pointer leave, focus leave or flip-back, with a 1.8–2.5s grace period.
- **Drag:** 5px threshold; horizontal drag rotates; release adds a capped velocity kick and snaps to the nearest work.
- **Flip:** only after the card is centered. The back face shows `STUDY 01`, title and subtitle; the card is a 3D flip on its own axis.
- **Reduced motion:** no intro, no auto rotation, no momentum; manual snap and flip remain.

## Components

- **Button:** square, 48px minimum height, 1px border, 12px label. Solid orange for primary, ink outline for secondary, ghost/paper for dark field.
- **Art frame:** transparent stage with registration corners; image and canvas share the same box. Gaps show the page ground; there is no simulated separator. Focusable; click/Enter replay; Space pause.
- **Works carousel:** native `<circular-carousel>` element. Front card is active and slightly scaled; three cards are visible at rest; the rest are behind the horizon and reachable by drag, arrows (desktop), index numbers, Tab and arrow keys.
- **Work card front:** square plate, 1px rule, image `object-fit: cover` with centered focal point. `cover` is intentional; some portrait/landscape studies lose edges.
- **Work card back:** soft-paper field, ink border, orange square, `STUDY 01`, display title, subtitle. No link inside the card; the caption’s `OPEN ↗` is the external link.
- **Caption:** one horizontal caption below the stage — study number, title, subtitle, `OPEN ↗`. It updates with the active card and is not a hover-only surface.
- **Index:** six numbered square buttons; active is ink on paper. This is the direct, non-drag route to every work.
- **Micro-grid:** 8×8 square field inside an ink panel; pointer perturbation uses transform only and returns via CSS transition. Secondary to the hero.
- **Gap dweller:** fixed, dismissible aside with a 7×7 pixel creature, close button and Esc support. It never traps focus or blocks page scrolling.
- **Error / fallback:** the static image remains visible whenever motion or data fails; a blocked image shows an explicit error panel instead of a broken icon. If the carousel script fails, the six works remain as a text list.

## States

`loading → idle → awakening → converging → outlining → rearranging → settling → complete ↔ interactive`

Orthogonal states: `paused`, `reduced-motion`, `fallback`, `is-enhanced` (works replaced by the carousel). The page exposes the current state on `#art-stage[data-state]` and `body[data-page-state]` for testing.

The carousel exposes `cc-change` and `cc-flip` events, `getState()`, `next()`, `prev()`, `goTo()`, `pause()` and `play()`.

## Responsive

- **≥1120px:** 12-column editorial hero; art capped at 620px; full carousel with side arrows; card base 260px.
- **960–1120px:** tighter shell, art capped at 560px; carousel still full.
- **720–960px:** hero stacks; art right-aligned at 410px; carousel arrows retire, index/swipe/keyboard remain; card base resolves to 230px.
- **≤720px:** shell `100% - 32px`; art 310–340px; works heading one line; carousel stage 380px; card resolves to 226px at 390.
- **≤390px:** art 310px; carousel index spans the width; one coordinate label is removed.

## Accessibility

- All controls are native `button` / `a` elements with visible `:focus-visible` outlines.
- The hero artwork is a focusable `role="button"` with an explicit label; Enter replays, Space pauses/resumes only while focused. A hidden `aria-live` phase region describes progress without adding visible chrome.
- Carousel cards are native buttons with `aria-pressed` for flip state and an explicit “聚焦并翻开…” name. All six are keyboard reachable; focusing a card brings it to the front.
- Carousel arrows and index buttons have explicit names; the index uses `aria-current`.
- A visually hidden `aria-live` status announces manual card changes and flips, not every auto-rotation tick.
- The artwork has an alt description; the canvas is `aria-hidden`.
- `prefers-reduced-motion` shows the complete static artwork, disables hero auto-motion and carousel auto-rotation, and keeps a low-motion fade for explicit replay.
- Content remains readable without JavaScript; the six-work text list is the fallback. The inline timeout exposes the static image and removes the broken loading state if the main script never loads.
- The egg is keyboard reachable through the footer button; Esc closes it and returns focus.

## Provenance

- Source B: `assets/source/logo-b.jpg`, 1672×941 JPEG, SHA-256 `2F10F4E...A7D3`.
- Transparent master: `assets/logo-mark.png`, 824×928 PNG, derived by white-matte extraction, SHA-256 `3DA975E...FA4B`.
- Target data: `assets/logo-data.json`, 378 cells, SHA-256 `CD95798...B8A`.
- Work covers are generated SVGs from `scripts/make_studies.py`; they are original concept studies, not B variants and not client work.
- The carousel is an independent native implementation. It does not include React Bits source, React, shadcn, or any third-party dependency.
- Fonts: Bricolage Grotesque and Silkscreen under the SIL Open Font License; license files are in `assets/fonts/`.
