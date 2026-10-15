/**
 * Seeded pseudo-random utilities for procedural maps.
 *
 * The same seed always yields the same stream, in Node and in the browser,
 * so a generated map can be replayed, rendered, or shared by its seed alone.
 *
 * Pure ES Module - Zero external dependencies.
 */

/** FNV-1a 32-bit hash of any string. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Creates a deterministic generator (mulberry32) with convenience helpers.
 * @param {string|number} seed
 */
export function createRng(seed) {
  let a = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = {
    next,
    /** Float in [min, max). */
    float(min = 0, max = 1) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max] (inclusive). */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(probability) {
      return next() < probability;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** Picks from [[value, weight], ...]. */
    weighted(entries) {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    /** Picks `count` distinct items. */
    sample(items, count) {
      return rng.shuffle(items).slice(0, count);
    },
  };
  return rng;
}

const SEED_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Creates a short, human-friendly seed code such as "K7Q2-M9XD".
 * Uses crypto randomness when available; pass an rng for deterministic codes.
 */
export function makeSeedCode(rng = null) {
  const draw = () => {
    if (rng) return rng.next();
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.getRandomValues) {
      return cryptoApi.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }
    return Math.random();
  };
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += SEED_ALPHABET[Math.floor(draw() * SEED_ALPHABET.length)];
  }
  return code;
}
