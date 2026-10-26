/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function step(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [next, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Tire un nombre entre 0 et 1 et fait avancer la graine stockée dans l'objet. */
export function rand(holder: { seed: number }): number {
  const [next, value] = step(holder.seed);
  holder.seed = next;
  return value;
}

/** Générateur autonome (pour l'interface et les tests). */
export function makeRng(seed = Date.now()): () => number {
  const holder = { seed: seed >>> 0 };
  return () => rand(holder);
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
