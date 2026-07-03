# TUNNELCRAFT Design System

The UI is a layered, token-driven CSS system. `client/src/styles.css` is a
manifest that imports the layers in order; every layer composes the tokens
defined in the first one. No CSS framework, no runtime styling library —
the whole system is plain CSS custom properties, which keeps it fast,
themeable, and easy to extend.

```
client/src/styles/
├── tokens.css      ← color, type, space, radius, elevation, z-index, motion
├── base.css        ← reset, app frame, buttons, forms, footer, a11y
├── header.css      ← brand, primary nav, sync state, mobile menu
├── components.css  ← cards, module view, lessons, labs, quiz, search, exam…
├── pages.css       ← landing, curriculum map, track, dashboard, glossary, auth
├── motion.css      ← micro-interactions (fully reduced-motion aware)
└── print.css       ← lesson documents & standalone certificates
```

## Tokens (`tokens.css`)

**Color.** Semantic first: `--bg`, `--panel`, `--panel2` (surfaces), `--line`
(borders), `--ink` / `--body` / `--mut` / `--dim` (text, strongest → weakest),
`--acc` / `--acc2` (brand orange), `--ok` / `--bad` (status), `--on-acc` (text
on accent), plus derived tints (`--acc-soft`, `--acc-glow`, `--veil`…) and the
OSI layer palette `--l1…--l7` used by glyphs and diagrams. Dark is the default;
light mode overrides the same variables under `[data-theme="light"]` — no
component ever hardcodes a theme color. The one deliberate exception: code
blocks stay dark in both themes because the syntax palette is tuned for it.

**Type.** Three families: `--font-disp` (Martian Mono — display/headings),
`--font-mono` (IBM Plex Mono — labels, code, metadata), `--font-sans`
(IBM Plex Sans — body). Sizes come from the `--fs-*` scale; the large steps
(`--fs-xl` and up) are fluid `clamp()` values so headings scale with the
viewport. Form inputs are ≥16px to prevent iOS focus zoom.

**Space.** `--sp-1…--sp-10` on a 4px base. `--gutter` is the fluid page
gutter (16→24px) and `--sect-y` the fluid section rhythm (40→64px). Layout
widths: `--content-w` (1000px shell) and `--lesson-w` (760px reading measure).

**The rest.** Radii `--r-xs…--r-full`, elevation `--shadow-1…3` (softened in
light mode), a z-index ladder (`--z-header < --z-menu < --z-overlay < --z-skip`)
so stacking is never guessed, and motion primitives: `--dur-1/2/3` with
`--ease-out` and `--ease-pop` (gentle overshoot for playful moments).

## Responsive strategy

Mobile-first fluid primitives (clamp gutters, fluid type, auto-fit grids) do
most of the work; explicit breakpoints handle structure:

- **1080px** — header sync bar hides (still available in the mobile menu).
- **920px** — primary nav, theme, and account collapse into the hamburger menu.
- **640px** — brand tagline hides, search button becomes icon-only, footer
  stacks, nav buttons stretch, syllabus rows compact (progress % stays visible).
- **560px** — match-drill rows stack, exam bar wraps, glossary gutter narrows.

Safe-area insets are respected (`viewport-fit=cover`), sticky offsets share the
`--hdr-h` token so the chip strip and exam bar always clear the header, and
every horizontal scroller (chips, tables, hexdumps, pcap) scrolls in place
rather than stretching the page.

## Motion principles

All motion lives in `motion.css` and is decorative: a single
`prefers-reduced-motion` block disables everything while keeping content
readable. The system is deliberately CSS-only (no GSAP/Framer) — the terminal
aesthetic wants crisp, quick moves, and zero runtime dependencies keeps the
bundle lean. Overshoot is faked where delight helps via `--ease-pop`.

Vocabulary:

- **Page entrance** — route views fade-rise 10px on mount.
- **Scroll reveal** — `<Reveal>` (`lib/reveal.tsx`) adds `.rv`/`.rvs` +
  IntersectionObserver; `stagger` cascades children 70ms apart.
- **Tactile press** — every button/chip/card scales ~0.97 on `:active`.
- **State feedback** — wrong answers shake, right answers settle, checklist
  ticks pop, the sync bar shows a barber-pole stripe while saving, the exam
  clock beats when time runs low.
- **Chip strip** — the active lesson chip auto-centers in its scroller.

## Brand

The mark is a tunnel portal (rounded square) with three chevrons — packets
entering the tunnel — drawn from `--ink` and `--acc` so it adapts to theme.
Sources: `components/brand.tsx` (in-app, theme-aware), `public/favicon.svg`
(fixed colors), with PNG derivatives `icon-192/512.png` and
`apple-touch-icon.png` plus `manifest.webmanifest` for install surfaces.
Regenerate PNGs from the SVG with:
`convert -background none -density 576 favicon.svg -resize 192x192 icon-192.png`

## Extending the system

- **New component** → compose tokens in `components.css`; never hardcode
  colors, spacing, z-index, or durations.
- **New page/area** → add a section to `pages.css`, or a new file imported
  from `styles.css` if it's a genuinely new surface.
- **New theme** → override the color block in `tokens.css` under a new
  `[data-theme="…"]` selector; everything downstream follows.
- **New motion** → add keyframes to `motion.css` and make sure the
  reduced-motion block neutralizes them to a readable resting state.
- **Header actions** → `components/header.tsx`; anything added to the desktop
  cluster should get a home in the mobile menu below 920px.
