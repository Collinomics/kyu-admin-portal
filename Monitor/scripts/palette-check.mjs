// Palette measurement helper — OKLab/OKLCH conversions, ΔE (OKLab ×100),
// WCAG contrast. Used to choose brand-anchored steps BEFORE running the
// official dataviz validator (scripts/validate_palette.js).

const sRGB = (c) => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const gamma = (c) => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
const hex2rgb = (h) => {
  h = h.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

// linear sRGB -> OKLab
const lrgb2oklab = ([r, g, b]) => {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
};
// OKLab -> linear sRGB
const oklab2lrgb = ([L, a, b]) => {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};
const ok = (hex) => lrgb2oklab(hex2rgb(hex).map(sRGB));
const oklch = (hex) => {
  const [L, a, b] = ok(hex);
  return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180) / Math.PI };
};
const deltaE = (h1, h2) => {
  const [l1, a1, b1] = ok(h1), [l2, a2, b2] = ok(h2);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
};
const lum = (hex) => {
  const [r, g, b] = hex2rgb(hex);
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (h1, h2) => {
  const [l1, l2] = [lum(h1), lum(h2)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
};
// Blend two hexes in OKLab space (perceptual)
const mix = (a, b, t) => {
  const A = ok(a), B = ok(b);
  const C = A.map((v, i) => v * (1 - t) + B[i] * t);
  const lin = oklab2lrgb(C);
  const to = (v) => Math.round(gamma(v) * 255).toString(16).padStart(2, "0");
  return `#${to(lin[0])}${to(lin[1])}${to(lin[2])}`;
};

const SURFACES = { light: "#fcfcfb", dark: "#1a1a19" };

console.log("=== dark-mode categorical candidates (dark band L 0.48-0.67) ===");
const darkCands = {
  "blue: mix(#1B5EA9,#fff,0.22)": mix("#1B5EA9", "#ffffff", 0.22),
  "blue: mix(#1B5EA9,#fff,0.30)": mix("#1B5EA9", "#ffffff", 0.3),
  "gold: mix(#D98A13,#fff,0.25)": mix("#D98A13", "#ffffff", 0.25),
  "gold: mix(#D98A13,#fff,0.35)": mix("#D98A13", "#ffffff", 0.35),
  "gold: #C98500 (ref dark yellow)": "#C98500",
  "aqua: #199e70 (ref dark)": "#199e70",
};
for (const [name, c] of Object.entries(darkCands)) {
  const { L, C } = oklch(c);
  console.log(`  ${name} -> ${c}  L=${L.toFixed(3)}  C=${C.toFixed(3)}  ctDark=${contrast(c, SURFACES.dark).toFixed(2)}`);
}

console.log("\n=== ΔE checks for chosen sets ===");
const lightSet = ["#1B5EA9", "#D98A13", "#1baf7a"];
console.log("LIGHT adjacent pairs:");
for (let i = 0; i < lightSet.length - 1; i++)
  console.log(`  ${lightSet[i]} vs ${lightSet[i + 1]}: ${deltaE(lightSet[i], lightSet[i + 1]).toFixed(1)}`);
const darkSet = [darkCands["blue: mix(#1B5EA9,#fff,0.30)"], darkCands["gold: mix(#D98A13,#fff,0.35)"], "#199e70"];
console.log("DARK adjacent pairs:");
for (let i = 0; i < darkSet.length - 1; i++)
  console.log(`  ${darkSet[i]} vs ${darkSet[i + 1]}: ${deltaE(darkSet[i], darkSet[i + 1]).toFixed(1)}`);
console.log(`  gold dark vs status warning #fab219: ${deltaE(darkSet[1], "#fab219").toFixed(1)}`);
console.log(`  gold light #D98A13 vs status serious #ec835a: ${deltaE("#D98A13", "#ec835a").toFixed(1)}`);

console.log("\n=== sequential light ramp (heatmap) — OKLab blend surface<->anchor<->night ===");
const lightRamp = {};
[0.08, 0.2, 0.34, 0.5, 0.68, 0.84].forEach((t, i) => {
  lightRamp[100 + i * 100] = mix(SURFACES.light, "#1B5EA9", t);
});
lightRamp[700] = mix("#1B5EA9", "#081A33", 0.5);
let prev = null;
for (const [step, hex] of Object.entries(lightRamp)) {
  const { L, C } = oklch(hex);
  const dL = prev === null ? "" : `  ΔL=${(L - prev).toFixed(3)}`;
  console.log(`  ${step}: ${hex}  L=${L.toFixed(3)}  C=${C.toFixed(3)}  ct=${contrast(hex, SURFACES.light).toFixed(2)}${dL}`);
  prev = L;
}

console.log("\n=== sequential dark ramp (heatmap) — OKLab blend darkSurface<->lightBlue ===");
const darkRamp = {};
[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].forEach((t, i) => {
  darkRamp[100 + i * 100] = mix(SURFACES.dark, "#7fa7d8", t);
});
darkRamp[700] = mix("#7fa7d8", "#ffffff", 0.5);
prev = null;
for (const [step, hex] of Object.entries(darkRamp)) {
  const { L, C } = oklch(hex);
  const dL = prev === null ? "" : `  ΔL=${(L - prev).toFixed(3)}`;
  console.log(`  ${step}: ${hex}  L=${L.toFixed(3)}  C=${C.toFixed(3)}  ct=${contrast(hex, SURFACES.dark).toFixed(2)}${dL}`);
  prev = L;
}
