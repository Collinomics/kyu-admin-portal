# Kyambogo Monitor — palette instance

The brand-anchored instance of the data-viz method (see the dataviz skill).
Every value below was run through `scripts/validate_palette.js` (the six-checks
validator) on 2026-08-26 — results recorded in
[`validation.md`](./validation.md). Nothing here is eyeballed; do not change a
slot without re-running the validator.

Brand anchors:

| Role | Hex | Use |
|---|---|---|
| Kyambogo blue | `#1B5EA9` | brand chrome (navbar, buttons), categorical slot 1 (light), single-series hue |
| Kyambogo amber | `#F8B13A` | brand chrome ONLY — accents, active states, logo |

`#F8B13A` is deliberately **not** a chart series color: OKLCH L 0.808 sits above
the light-mode lightness band (0.43–0.77) and it sits ΔE 1.5 from the fixed
status "warning" hue (`#fab219`) — as a series it would impersonate a status
color. It lives in the UI chrome, where a brand color belongs.

## Categorical (identity) — fixed order, never cycled

| Slot | Hue | Light | Dark |
|------|-----|-------|------|
| 1 | blue (brand) | `#1B5EA9` | `#2d76cd` |
| 2 | gold (amber family, stepped into band) | `#D98A13` | `#C98500` |
| 3 | aqua | `#1baf7a` | `#199e70` |

- Light: ALL PASS (band, chroma, CVD ΔE 9.5, normal-vision 21.3). Contrast WARN
  on slots 2–3 (2.69 / 2.74) → relief rule: visible direct labels + table view
  ship on every chart.
- Dark: ALL PASS, no warnings.
- Collisions with fixed status hues (`#D98A13` ↔ serious `#ec835a` ΔE 7.0,
  ↔ warning ΔE 11.6): accepted, same family of accepted collisions as the
  reference palette — status always ships icon + label and never appears as a
  plain series.
- All-pairs (scatter/map/small-multiples) validated for all 3 slots in both
  modes; a 4th slot would need re-validation. Adjacent forms (stacks, bars,
  lines) use slots 1→3 in order.

## Sequential / ordinal (magnitude) — blue ramp

One hue, light→dark (light mode) / dark→light (dark mode).

Ordinal bins (heatmap) — validated `--ordinal` in both modes (monotone L,
ΔL ≥ 0.06, light end ≥ 2:1):

| bin | Light | Dark |
|-----|-------|------|
| 1 (low) | `#8dadd4` | `#546a85` |
| 2 | `#6690c5` | `#6480a3` |
| 3 | `#4377b7` | `#7497c3` |
| 4 (high) | `#1B5EA9` | `#bed3ec` |

The light ramp ends at the brand anchor; the dark ramp flips (higher magnitude =
lighter). Continuous scales (heatmaps with interpolation) use these same anchors.

## Status (fixed — never themed)

| role | hex | notes |
|---|---|---|
| good | `#0ca30c` | always icon + label |
| warning | `#fab219` | light-surface contrast 1.79 by design → icon + label is the mitigation |
| serious | `#ec835a` | ditto |
| critical | `#d03b3b` | ditto |

## Chart chrome & ink

| Role | Light | Dark |
|---|---|---|
| Page plane | `#f9f9f7` | `#0d0d0d` |
| Chart surface / card | `#fcfcfb` | `#1a1a19` |
| Surface hover wash | `#f3f2ee` | `#232323` |
| Primary ink | `#0b0b0b` | `#ffffff` |
| Secondary ink | `#52514e` | `#c3c2b7` |
| Muted (axis/labels) | `#898781` | `#898781` |
| Gridline (hairline) | `#e1e0d9` | `#2c2c2a` |
| Baseline / axis | `#c3c2b7` | `#383835` |
| Delta up good | `#006300` | `#0ca30c` |
| Border (hairline ring) | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` |
| De-emphasis series (emphasis charts, sparklines) | `#a6a49b` | `#6b6b68` |

## Brand chrome contrast (WCAG)

- White on `#1B5EA9`: 6.52:1 ✓ (navbar text)
- `#F8B13A` on `#1B5EA9`: 3.52:1 ✓ (large/UI accents only)
- `#0b0b0b` on `#F8B13A`: 10.63:1 ✓ (text on amber buttons)

## Typeface & figures

`system-ui, -apple-system, "Segoe UI", sans-serif` everywhere, including hero
figures. Proportional figures on stat tiles; `tabular-nums` only in table
columns and axis ticks.

## Texture (a11y channel)

One directional "lines" fill at 45°/135°, triggered by `forced-colors` / print
only — never on by default.
