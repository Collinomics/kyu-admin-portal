# Palette validation record

Run with `scripts/validate_palette.js` (the dataviz skill's six-checks
validator) on 2026-08-26.

## Light categorical — `#1B5EA9,#D98A13,#1baf7a` — surface `#fcfcfb`

```
[PASS] Lightness band         all 3 inside L 0.43–0.77
[PASS] Chroma floor           all 3 >= 0.1
[PASS] CVD separation         worst adjacent #1baf7a↔#D98A13 ΔE 9.5 (protan)
[PASS] Normal-vision floor    worst adjacent #1baf7a↔#D98A13 ΔE 21.3
[WARN] Contrast vs surface    below 3:1: #D98A13 (2.69), #1baf7a (2.74)
→ ALL CHECKS PASS — WARN obligates direct labels + table view (shipped).
```

Same set under `--pairs all`: ALL PASS (worst all-pairs ΔE 9.5 protan).

## Dark categorical — `#2d76cd,#C98500,#199e70` — surface `#1a1a19`

```
[PASS] Lightness band         all 3 inside L 0.48–0.67
[PASS] Chroma floor           all 3 >= 0.1
[PASS] CVD separation         worst adjacent #199e70↔#C98500 ΔE 8.4 (protan)
[PASS] Normal-vision floor    worst adjacent #199e70↔#C98500 ΔE 19.8
[PASS] Contrast vs surface    all 3 >= 3:1
→ ALL CHECKS PASS, no warnings.
```

Same set under `--pairs all`: ALL PASS (worst all-pairs ΔE 8.4 protan).

Note: first dark-blue candidate `#628ec5` FAILED the chroma floor (C 0.096);
stepped to `#2d76cd` (C 0.152).

## Ordinal ramps (heatmap bins)

Light `#8dadd4,#6690c5,#4377b7,#1B5EA9` (surface `#fcfcfb`):

```
[PASS] Lightness monotone     steps read light→dark
[PASS] Adjacent ΔL            all gaps >= 0.06
[PASS] Light-end contrast     #8dadd4 at 2.26:1
[PASS] Single hue             hue spread 1°
```

Dark `#546a85,#6480a3,#7497c3,#bed3ec` (surface `#1a1a19`):

```
[PASS] Lightness monotone     steps read light→dark
[PASS] Adjacent ΔL            all gaps >= 0.06
[PASS] Light-end contrast     #546a85 at 3.13:1
[PASS] Single hue             hue spread 2°
```

## Brand chrome (WCAG)

- White on `#1B5EA9`: 6.52:1
- `#F8B13A` on `#1B5EA9`: 3.52:1
- `#0b0b0b` on `#F8B13A`: 10.63:1

## Rejected candidates

- `#F8B13A` (raw brand amber) as series: L 0.808 outside band; ΔE 1.5 vs status
  warning → chrome only.
- `#628ec5` (dark blue, white-mix): chroma 0.096 below floor.
- `#e8b47a` (dark gold, white-mix): L 0.804 outside dark band.
