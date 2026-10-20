// Deterministic seeded PRNG so the mock history is stable across reloads,
// while the live tail evolves in real time (see data/mockEngine.ts).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max) */
export const range = (rnd: () => number, min: number, max: number) =>
  min + rnd() * (max - min);

/** Random integer in [min, max] */
export const irange = (rnd: () => number, min: number, max: number) =>
  Math.floor(range(rnd, min, max + 1));

/** Pick a random element */
export const pick = <T,>(rnd: () => number, arr: T[]): T =>
  arr[Math.floor(rnd() * arr.length)];

/** Weighted pick: entries as [value, weight] */
export const pickWeighted = <T,>(rnd: () => number, entries: [T, number][]): T => {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
};
