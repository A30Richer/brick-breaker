/**
 * Procedural Map Generator
 *
 * Builds a fresh 32x46 level from a seed. A map is composed from
 *  1. a field motif (bands, rings, spiral, pixel-art sprite, skyline, ...)
 *     that decides where bricks sit and which armor tier each band gets,
 *  2. a symmetry mode (mirror, echo, none),
 *  3. one to three wall structures (chutes, funnels, vaults, rings, ...),
 *  4. specials (bomb fuses for chain reactions, boosters, x2 / +3 bricks),
 *  5. a color theme with a per-cell palette grid.
 *
 * Every map is repaired so permanent walls never seal bricks, then checked
 * with the same ball-clearance flood the campaign validator uses.
 * The same seed always produces the same map; MapSequence produces an
 * endless run where neighbouring maps never share a motif or a recipe.
 *
 * Pure ES Module - Zero external dependencies.
 */

import { createRng, hashString, makeSeedCode } from './rng.js';
import { PALETTES, PALETTE_NAMES, THEME_COLOR_COUNT, buildTheme } from './map_theme.js';
import { LevelManager } from './level_manager.js';
import { analyzeBallClearance } from './clearance.js';

export const MAP_COLS = 32;
export const MAP_ROWS = 46;

const CELL_W = 15;
const CELL_H = 11;
const EMPTY = '0';
const WALL = '4';
const BREAKABLE = new Set(['1', '2', '3', '5', '6', '7', '8', '9']);
const ARMOR = new Set(['1', '2', '3']);
const TAU = Math.PI * 2;

export const DIFFICULTY_PROFILES = Object.freeze({
  chill: Object.freeze({
    label: 'CHILL',
    tierWeights: [['1', 88], ['2', 10], ['3', 2]],
    sprinkle: 0.015,
    speed: [430, 460],
    bombs: [10, 16],
    boosters: [1, 3],
    interiorPowerups: [12, 18],
    shields: [4, 6],
    structureCount: [1, 2],
    structureWeights: { chutes: 5, funnel: 4, gutters: 4, galleries: 2, pillars: 2, baffles: 1, vault: 1, ring: 1, stairs: 1 },
    expressChance: 0.95,
    breakables: [260, 680],
  }),
  normal: Object.freeze({
    label: 'NORMAL',
    tierWeights: [['1', 72], ['2', 22], ['3', 6]],
    sprinkle: 0.04,
    speed: [460, 500],
    bombs: [8, 13],
    boosters: [2, 4],
    interiorPowerups: [12, 16],
    shields: [3, 5],
    structureCount: [1, 3],
    structureWeights: { chutes: 4, funnel: 3, gutters: 2, galleries: 3, pillars: 3, baffles: 2, vault: 3, ring: 2, stairs: 2 },
    expressChance: 0.8,
    breakables: [340, 780],
  }),
  hard: Object.freeze({
    label: 'HARD',
    tierWeights: [['1', 50], ['2', 34], ['3', 16]],
    sprinkle: 0.06,
    speed: [500, 540],
    bombs: [5, 9],
    boosters: [3, 5],
    interiorPowerups: [10, 14],
    shields: [3, 4],
    structureCount: [2, 3],
    structureWeights: { chutes: 3, funnel: 2, gutters: 1, galleries: 3, pillars: 3, baffles: 3, vault: 4, ring: 3, stairs: 3 },
    expressChance: 0.5,
    breakables: [400, 900],
  }),
});

export const DIFFICULTY_NAMES = Object.freeze(Object.keys(DIFFICULTY_PROFILES));

const SYMMETRY_LABELS = { mirror: 'Mirror', echo: 'Echo', none: 'Freeform' };

const STRUCTURE_LABELS = {
  chutes: 'Chutes', funnel: 'Funnel', gutters: 'Side Lanes', galleries: 'Galleries',
  pillars: 'Pillars', baffles: 'Baffles', vault: 'Vault', ring: 'Orbit Ring', stairs: 'Stairs',
};

// Pixel-art sprites: '.' background, 'a' body, 'b' detail.
const SPRITES = {
  Invader: [
    '..a.....a..',
    '...a...a...',
    '..aaaaaaa..',
    '.aabaaabaa.',
    'aaaaaaaaaaa',
    'a.aaaaaaa.a',
    'a.a.....a.a',
    '...aa.aa...',
  ],
  Heart: [
    '..aaa...aaa..',
    '.abbaa.aaaaa.',
    'abbaaaaaaaaaa',
    'abaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    '.aaaaaaaaaaa.',
    '..aaaaaaaaa..',
    '...aaaaaaa...',
    '....aaaaa....',
    '.....aaa.....',
    '......a......',
  ],
  Star: [
    '.....a.....',
    '....aba....',
    '....aba....',
    'aaaaabaaaaa',
    '.abbbbbbba.',
    '..aabbbaa..',
    '..aabbbaa..',
    '.aaaa.aaaa.',
    '.aa.....aa.',
    'a.........a',
  ],
  Skull: [
    '...aaaaa...',
    '.aaaaaaaaa.',
    'aaaaaaaaaaa',
    'aabbbabbbaa',
    'aabbbabbbaa',
    'aaaaaaaaaaa',
    '.aaaabaaaa.',
    '..aaaaaaa..',
    '..ababab...',
    '..aaaaaaa..',
  ],
  Ghost: [
    '....aaaaa....',
    '..aaaaaaaaa..',
    '.aaaaaaaaaaa.',
    '.abbaaaaabba.',
    'abbbbaaabbbba',
    'abbbbaaabbbba',
    'aabbaaaaabbaa',
    'aaaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    'aa.aaa.aaa.aa',
    'a...a...a...a',
  ],
  Gem: [
    '...aaaaaaa...',
    '..abbbbbbba..',
    '.abbaaaaabba.',
    'aaaaaaaaaaaaa',
    '.abbbbbbbbba.',
    '..abbbbbbba..',
    '...abbbbba...',
    '....abbba....',
    '.....aba.....',
    '......a......',
  ],
  Crown: [
    'a....a....a',
    'aa..aaa..aa',
    'aaa.aba.aaa',
    'aaaaaaaaaaa',
    'abababababa',
    'aaaaaaaaaaa',
    'aaaaaaaaaaa',
  ],
};
const SPRITE_NAMES = Object.keys(SPRITES);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const mod = (value, n) => ((value % n) + n) % n;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const px = col => (col + 0.5) * CELL_W;
const py = row => (row + 0.5) * CELL_H;

function makeGrid(rows, cols, value) {
  return Array.from({ length: rows }, () => new Array(cols).fill(value));
}

function randomTable(rng, size = 64) {
  const table = new Float64Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rng.next();
  return (i, j) => table[mod(i, size) * size + mod(j, size)];
}

function valueNoise(rng, scale) {
  const lattice = randomTable(rng, 32);
  const smooth = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale;
    const fy = y / scale;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const top = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * tx;
    const bottom = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

function setCell(ctx, row, col, value) {
  if (row >= 0 && row < ctx.rows && col >= 0 && col < ctx.cols) ctx.m[row][col] = value;
}

function getCell(ctx, row, col) {
  if (row < 0 || row >= ctx.rows || col < 0 || col >= ctx.cols) return null;
  return ctx.m[row][col];
}

/** Column range structures may use; the mirror/echo stage copies it across. */
function sourceSpan(ctx) {
  if (ctx.symmetry === 'mirror') return { lo: 0, hi: ctx.cols / 2 - 1 };
  if (ctx.symmetry === 'echo') return { lo: 0, hi: ctx.cols / 2 - 1 };
  return { lo: 0, hi: ctx.cols - 1 };
}

function centerX(ctx) {
  return ctx.symmetry === 'none' ? ctx.rng.float(140, 340) : (ctx.cols * CELL_W) / 2;
}

function fieldCenterY(ctx, lo = 0.3, hi = 0.6) {
  return py(ctx.top) + ctx.rng.float(lo, hi) * (ctx.bottom - ctx.top) * CELL_H;
}

// ---------------------------------------------------------------------------
// 1. Field motifs: (row, col) -> band index, or -1 for an empty cell
// ---------------------------------------------------------------------------

const MOTIFS = {
  bands: {
    weight: 7, noun: 'Strata',
    build(ctx) {
      const { rng, top } = ctx;
      const height = rng.int(1, 3);
      const gap = rng.chance(0.6) ? 1 : 0;
      const period = height + gap;
      return (r) => {
        const k = r - top;
        if (gap && k % period >= height) return -1;
        return Math.floor(k / period);
      };
    },
  },
  stripes: {
    weight: 5, noun: 'Columns',
    build(ctx) {
      const { rng, top } = ctx;
      const width = rng.int(1, 3);
      const gap = rng.chance(0.4) ? 1 : 0;
      const period = width + gap;
      const offset = rng.int(0, period - 1);
      const cut = rng.chance(0.5) ? rng.int(3, 6) : 0;
      return (r, c) => {
        const k = c + offset;
        if (gap && k % period >= width) return -1;
        return Math.floor(k / period) + (cut ? Math.floor((r - top) / cut) : 0);
      };
    },
  },
  checker: {
    weight: 7, noun: 'Checkerboard',
    build(ctx) {
      const { rng, top } = ctx;
      const bw = rng.int(2, 4);
      const bh = rng.int(2, 4);
      const states = rng.pick([2, 2, 3]);
      const holes = rng.chance(0.4) ? rng.float(0.08, 0.22) : 0;
      const table = randomTable(rng);
      return (r, c) => {
        const bi = Math.floor(c / bw);
        const bj = Math.floor((r - top) / bh);
        if (holes && table(bi, bj) < holes) return -1;
        return (bi + bj) % states;
      };
    },
  },
  diagonal: {
    weight: 6, noun: 'Slant',
    build(ctx) {
      const { rng, top } = ctx;
      const dir = rng.pick([1, -1]);
      const width = rng.int(2, 4);
      const gap = rng.chance(0.35) ? 1 : 0;
      const slope = rng.pick([1, 1, 2]);
      const period = width + gap;
      return (r, c) => {
        const v = (r - top) + dir * Math.floor(c / slope) + 200;
        if (gap && v % period === width) return -1;
        return Math.floor(v / period);
      };
    },
  },
  rings: {
    weight: 7, noun: 'Halo',
    build(ctx) {
      const { rng } = ctx;
      const cx = centerX(ctx);
      const cy = fieldCenterY(ctx);
      const width = rng.float(20, 38);
      const gapWidth = rng.chance(0.45) ? rng.float(9, 12) : 0;
      const squash = rng.float(0.8, 1.25);
      return (r, c) => {
        const d = Math.hypot(px(c) - cx, (py(r) - cy) * squash);
        if (gapWidth && d % width < gapWidth) return -1;
        return Math.floor(d / width);
      };
    },
  },
  diamonds: {
    weight: 6, noun: 'Rhombus',
    build(ctx) {
      const { rng } = ctx;
      const cx = centerX(ctx);
      const cy = fieldCenterY(ctx);
      const width = rng.float(22, 40);
      const gapWidth = rng.chance(0.4) ? rng.float(9, 12) : 0;
      const stretch = rng.float(0.8, 1.4);
      return (r, c) => {
        const d = Math.abs(px(c) - cx) + Math.abs(py(r) - cy) * stretch;
        if (gapWidth && d % width < gapWidth) return -1;
        return Math.floor(d / width);
      };
    },
  },
  waves: {
    weight: 7, noun: 'Tide',
    build(ctx) {
      const { rng, top } = ctx;
      const amp = rng.float(1, 4);
      const freq = rng.float(0.18, 0.5);
      const phase = rng.float(0, TAU);
      const height = rng.int(2, 3);
      const gap = rng.chance(0.4) ? 1 : 0;
      const period = height + gap;
      return (r, c) => {
        const v = Math.floor(r - top + amp * Math.sin(c * freq + phase) + 10);
        if (gap && v % period === height) return -1;
        return Math.floor(v / period);
      };
    },
  },
  blobs: {
    weight: 6, noun: 'Caverns',
    build(ctx) {
      const { rng } = ctx;
      const shape = valueNoise(rng, rng.float(4, 7));
      const shade = valueNoise(rng, rng.float(3, 5));
      const threshold = rng.float(0.26, 0.38);
      const levels = rng.int(3, 5);
      return (r, c) => {
        const aspect = CELL_H / CELL_W;
        if (shape(c, r * aspect) < threshold) return -1;
        return Math.floor(shade(c, r * aspect) * levels);
      };
    },
  },
  spiral: {
    weight: 5, noun: 'Vortex',
    build(ctx) {
      const { rng } = ctx;
      const cx = centerX(ctx);
      const cy = fieldCenterY(ctx, 0.35, 0.55);
      const arms = rng.int(1, 3);
      const width = rng.float(28, 46);
      const gap = rng.chance(0.65);
      const dir = rng.pick([1, -1]);
      return (r, c) => {
        const dx = px(c) - cx;
        const dy = py(r) - cy;
        const v = Math.hypot(dx, dy) / width + arms * (dir * Math.atan2(dy, dx) / TAU) + 10;
        if (gap && v - Math.floor(v) < 0.2) return -1;
        return Math.floor(v);
      };
    },
  },
  sprite: {
    weight: 6, noun: null, bandTints: true,
    build(ctx) {
      const { rng, top, bottom, cols } = ctx;
      const name = rng.pick(SPRITE_NAMES);
      const bitmap = SPRITES[name];
      const sw = bitmap[0].length;
      const sh = bitmap.length;
      const fieldH = bottom - top + 1;
      const sx = clamp(rng.int(2, 3), 1, Math.floor((cols - 2) / sw));
      const sy = clamp(rng.int(2, 3), 1, Math.floor((fieldH - 2) / sh));
      const ox = Math.floor((cols - sw * sx) / 2) + (ctx.symmetry === 'none' ? rng.int(-2, 2) : 0);
      const oy = top + Math.floor((fieldH - sh * sy) * rng.float(0.15, 0.55));
      const background = rng.weighted([['bands', 3], ['halo', 3], ['sparse', 2]]);
      const bandHeight = rng.int(1, 2);
      ctx.spriteName = name;

      const pixelAt = (r, c) => {
        const sxp = Math.floor((c - ox) / sx);
        const syp = Math.floor((r - oy) / sy);
        if (c < ox || r < oy || sxp >= sw || syp >= sh) return '.';
        return bitmap[syp][sxp];
      };
      const nearSprite = (r, c) => {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) if (pixelAt(r + dr, c + dc) !== '.') return true;
        }
        return false;
      };
      return (r, c) => {
        const pixel = pixelAt(r, c);
        if (pixel === 'a') return 10;
        if (pixel === 'b') return 11;
        if (background === 'halo' && nearSprite(r, c)) return -1;
        if (background === 'sparse' && (r - top) % 3 === 2) return -1;
        return Math.floor((r - top) / (bandHeight + 1)) % 3;
      };
    },
  },
  skyline: {
    weight: 5, noun: 'Skyline',
    build(ctx) {
      const { rng, top, bottom } = ctx;
      const width = rng.int(2, 4);
      const inverted = rng.chance(0.3);
      const alleys = width >= 3 && rng.chance(0.4);
      const bandHeight = rng.int(2, 4);
      const fieldH = bottom - top + 1;
      const heights = Array.from({ length: 32 }, () => rng.float(0.35, 1));
      return (r, c) => {
        const tower = Math.floor(c / width);
        if (alleys && c % width === width - 1) return -1;
        const k = inverted ? r - top : bottom - r;
        if (k >= Math.round(heights[tower] * fieldH)) return -1;
        return (tower % 3) + 3 * (Math.floor(k / bandHeight) % 2);
      };
    },
  },
  lattice: {
    weight: 6, noun: 'Lattice',
    build(ctx) {
      const { rng, top } = ctx;
      const roomW = rng.int(4, 7);
      const roomH = rng.int(3, 6);
      const brickBond = rng.chance(0.5);
      const missing = rng.float(0, 0.15);
      const table = randomTable(rng);
      return (r, c) => {
        const k = r - top;
        const bj = Math.floor(k / (roomH + 1));
        const kc = c + (brickBond && bj % 2 ? Math.floor(roomW / 2) : 0);
        const bi = Math.floor(kc / (roomW + 1));
        if (k % (roomH + 1) === roomH || kc % (roomW + 1) === roomW) return -1;
        if (table(bi, bj) < missing) return -1;
        return Math.floor(table(bi + 7, bj + 3) * 6);
      };
    },
  },
  islands: {
    weight: 4, noun: 'Archipelago',
    build(ctx) {
      const { rng, top, bottom } = ctx;
      const fieldPx = (bottom - top + 1) * CELL_H;
      const islands = Array.from({ length: rng.int(7, 12) }, (_, band) => ({
        x: rng.float(20, 460), y: py(top) + rng.float(0, fieldPx),
        rx: rng.float(45, 105), ry: rng.float(30, 75), band: band % 6,
      }));
      const filler = rng.chance(0.4);
      return (r, c) => {
        for (const island of islands) {
          const dx = (px(c) - island.x) / island.rx;
          const dy = (py(r) - island.y) / island.ry;
          if (dx * dx + dy * dy <= 1) return island.band;
        }
        return filler && (r - top) % 4 === 0 ? 7 : -1;
      };
    },
  },
  chevron: {
    weight: 6, noun: 'Chevrons',
    build(ctx) {
      const { rng, top, cols } = ctx;
      const slope = rng.pick([0.3, 0.45, 0.6, 0.9]);
      const height = rng.int(2, 3);
      const dir = rng.pick([1, -1]);
      const gap = rng.chance(0.4) ? 1 : 0;
      const axis = ctx.symmetry === 'none' ? rng.float(8, 23) : cols / 2 - 0.5;
      const period = height + gap;
      return (r, c) => {
        const v = Math.floor((r - top) + dir * Math.abs(c - axis) * slope + 100);
        if (gap && v % period === height) return -1;
        return Math.floor(v / period);
      };
    },
  },
};

export const MOTIF_NAMES = Object.freeze(Object.keys(MOTIFS));

function drawTierMap(rng, profile) {
  const length = rng.int(2, 4);
  const map = Array.from({ length }, () => rng.weighted(profile.tierWeights));
  if (!map.includes('1')) map[rng.int(0, length - 1)] = '1';
  return map;
}

function buildField(ctx) {
  const { rng, profile } = ctx;
  const motifEntries = MOTIF_NAMES.map(name => [name, MOTIFS[name].weight]);
  ctx.motif = rng.weighted(motifEntries);
  ctx.layer = rng.chance(0.25)
    ? rng.weighted(motifEntries.filter(([name]) => name !== ctx.motif && name !== 'sprite'))
    : null;
  const primary = MOTIFS[ctx.motif].build(ctx);
  const secondary = ctx.layer ? MOTIFS[ctx.layer].build(ctx) : null;
  const split = secondary ? rng.int(ctx.top + Math.round((ctx.bottom - ctx.top) * 0.35), ctx.top + Math.round((ctx.bottom - ctx.top) * 0.65)) : Infinity;
  const tierMap = drawTierMap(rng, profile);
  const layerTierMap = drawTierMap(rng, profile);

  for (let r = ctx.top; r <= ctx.bottom; r++) {
    for (let c = 0; c < ctx.cols; c++) {
      const useLayer = r >= split;
      const band = useLayer ? secondary(r, c) : primary(r, c);
      if (band < 0) continue;
      const tiers = useLayer ? layerTierMap : tierMap;
      let tier = tiers[mod(band, tiers.length)];
      if (rng.chance(profile.sprinkle)) tier = String(Math.min(3, Number(tier) + 1));
      ctx.m[r][c] = tier;
      ctx.bands[r][c] = useLayer ? band + 3 : band;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Wall structures
// ---------------------------------------------------------------------------

function carveChute(ctx, col, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r++) {
    setCell(ctx, r, col, EMPTY);
    setCell(ctx, r, col - 1, WALL);
    setCell(ctx, r, col + 1, WALL);
  }
  ctx.corridors.push({ type: 'VERTICAL', chuteCol: col, leftWallCol: col - 1, rightWallCol: col + 1, startRow: fromRow, endRow: toRow });
}

function chuteTop(ctx) {
  // Most lanes break through to the open pocket above the field, where a
  // ball ricochets between the ceiling and the bricks: the satisfying part.
  return ctx.rng.chance(0.85)
    ? ctx.top
    : ctx.rng.int(ctx.top + 4, ctx.top + Math.floor((ctx.bottom - ctx.top) * 0.6));
}

function pickSpacedColumns(ctx, count, lo, hi, spacing) {
  const picked = [];
  const taken = ctx.corridors.filter(corridor => corridor.chuteCol !== undefined).map(corridor => corridor.chuteCol);
  for (let attempt = 0; attempt < 40 && picked.length < count; attempt++) {
    const col = ctx.rng.int(lo, hi);
    if ([...taken, ...picked].every(other => Math.abs(other - col) >= spacing)) picked.push(col);
  }
  return picked;
}

function wallFree(ctx, r0, c0, r1, c1, margin = 1) {
  for (let r = r0 - margin; r <= r1 + margin; r++) {
    for (let c = c0 - margin; c <= c1 + margin; c++) {
      if (getCell(ctx, r, c) === WALL) return false;
    }
  }
  return true;
}

const STRUCTURES = {
  chutes(ctx) {
    const { lo, hi } = sourceSpan(ctx);
    const count = ctx.symmetry === 'none' ? ctx.rng.int(1, 3) : ctx.rng.int(1, 2);
    const maxCol = ctx.symmetry === 'echo' ? hi - 1 : hi;
    for (const col of pickSpacedColumns(ctx, count, lo + 3, maxCol, 4)) {
      carveChute(ctx, col, chuteTop(ctx), ctx.bottom);
    }
  },

  funnel(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const centered = ctx.symmetry === 'mirror';
    const depth = centered ? rng.int(4, 7) : Math.min(rng.int(4, 7), Math.floor((hi - lo - 6) / 2));
    const apex = centered ? ctx.cols / 2 - 1 : rng.int(lo + depth + 3, hi - depth - 2);
    const apexRow = ctx.bottom - depth;
    for (let i = 0; i <= depth; i++) {
      const r = apexRow + i;
      for (let c = apex - i; c <= apex + i; c++) setCell(ctx, r, c, EMPTY);
      setCell(ctx, r, apex - 1 - i, WALL);
      if (!centered) setCell(ctx, r, apex + 1 + i, WALL);
    }
    carveChute(ctx, apex, chuteTop(ctx), apexRow);
  },

  gutters(ctx) {
    const fromRow = ctx.rng.chance(0.7) ? ctx.top : ctx.rng.int(ctx.top + 5, ctx.top + Math.floor((ctx.bottom - ctx.top) / 2));
    const sides = ctx.symmetry === 'none' ? ctx.rng.pick([['left'], ['right'], ['left', 'right']]) : ['left'];
    for (const side of sides) {
      const col = side === 'left' ? 0 : ctx.cols - 1;
      const inner = side === 'left' ? 1 : ctx.cols - 2;
      for (let r = fromRow; r <= ctx.bottom; r++) {
        setCell(ctx, r, col, EMPTY);
        setCell(ctx, r, inner, WALL);
      }
      ctx.corridors.push({ type: 'VERTICAL', chuteCol: col, leftWallCol: col - 1, rightWallCol: col + 1, startRow: fromRow, endRow: ctx.bottom });
    }
  },

  galleries(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const rows = [];
    const count = rng.int(1, 3);
    for (let attempt = 0; attempt < 30 && rows.length < count; attempt++) {
      const row = rng.int(ctx.top + 3, ctx.bottom - 4);
      if (rows.every(other => Math.abs(other - row) >= 5)) rows.push(row);
    }
    for (const row of rows) {
      const length = rng.int(6, Math.min(20, hi - lo));
      const start = ctx.symmetry === 'mirror' && rng.chance(0.5) ? hi - length + 1 : rng.int(lo + 1, hi - length + 1);
      const end = start + length - 1;
      for (let c = start; c <= end; c++) {
        setCell(ctx, row, c, EMPTY);
        setCell(ctx, row - 1, c, WALL);
        setCell(ctx, row + 1, c, WALL);
      }
      ctx.corridors.push({ type: 'HORIZONTAL', chuteRow: row, topWallRow: row - 1, bottomWallRow: row + 1, startCol: start, endCol: end });
    }
  },

  pillars(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const target = rng.int(5, 12);
    let placed = 0;
    for (let attempt = 0; attempt < 120 && placed < target; attempt++) {
      const w = rng.int(1, 2);
      const h = rng.int(1, 2);
      const r = rng.int(ctx.top + 2, ctx.bottom - 2 - h);
      const c = rng.int(lo + 1, hi - w);
      if (!wallFree(ctx, r, c, r + h - 1, c + w - 1, 2)) continue;
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) setCell(ctx, r + dr, c + dc, WALL);
      placed++;
    }
  },

  baffles(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const spacing = rng.int(5, 7);
    const segment = rng.int(3, 5);
    const gap = rng.int(3, 6);
    let index = 0;
    for (let r = ctx.top + 3; r <= ctx.bottom - 3; r += spacing, index++) {
      const offset = index % 2 ? Math.floor((segment + gap) / 2) : 0;
      for (let c = lo + offset; c + segment - 1 <= hi; c += segment + gap) {
        for (let k = 0; k < segment; k++) setCell(ctx, r, c + k, WALL);
      }
    }
  },

  vault(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const centered = ctx.symmetry === 'mirror' && rng.chance(0.5);
    const w = centered ? 2 * rng.int(4, 6) : rng.int(6, 9);
    const h = rng.int(5, 8);
    const left = centered ? ctx.cols / 2 - w / 2 : rng.int(lo + 1, Math.max(lo + 1, hi - w));
    const right = left + w - 1;
    const topRow = rng.int(ctx.top + 2, Math.max(ctx.top + 2, ctx.bottom - h - 3));
    const bottomRow = topRow + h - 1;
    for (let c = left; c <= right; c++) {
      setCell(ctx, topRow, c, WALL);
      setCell(ctx, bottomRow, c, WALL);
    }
    for (let r = topRow; r <= bottomRow; r++) {
      setCell(ctx, r, left, WALL);
      setCell(ctx, r, right, WALL);
    }
    // Two gates on different faces; a breakable door looks like part of the vault.
    const faces = rng.sample(['top', 'bottom', 'left', 'right'], 2);
    for (const face of faces) {
      const door = rng.chance(0.5) ? EMPTY : '2';
      if (face === 'top') setCell(ctx, topRow, rng.int(left + 1, right - 1), door);
      if (face === 'bottom') setCell(ctx, bottomRow, rng.int(left + 1, right - 1), door);
      if (face === 'left') setCell(ctx, rng.int(topRow + 1, bottomRow - 1), left, door);
      if (face === 'right') setCell(ctx, rng.int(topRow + 1, bottomRow - 1), right, door);
    }
    for (let r = topRow + 1; r < bottomRow; r++) {
      for (let c = left + 1; c < right; c++) if (getCell(ctx, r, c) === EMPTY) setCell(ctx, r, c, '1');
    }
    ctx.cores.push({ row: Math.floor((topRow + bottomRow) / 2), col: Math.floor((left + right) / 2) });
  },

  ring(ctx) {
    const { rng } = ctx;
    const cx = centerX(ctx);
    const cy = fieldCenterY(ctx, 0.35, 0.6);
    const radius = rng.float(55, 100);
    const gaps = Array.from({ length: rng.int(2, 4) }, () => rng.float(0, TAU));
    const gapHalf = rng.float(0.22, 0.34);
    for (let r = ctx.top; r <= ctx.bottom; r++) {
      for (let c = 0; c < ctx.cols; c++) {
        const dx = px(c) - cx;
        const dy = py(r) - cy;
        if (Math.abs(Math.hypot(dx, dy) - radius) >= 8) continue;
        const theta = Math.atan2(dy, dx);
        const inGap = gaps.some(angle => Math.abs(mod(theta - angle + Math.PI, TAU) - Math.PI) < gapHalf);
        if (!inGap) setCell(ctx, r, c, WALL);
      }
    }
    ctx.cores.push({ row: Math.round(cy / CELL_H - 0.5), col: Math.round(cx / CELL_W - 0.5) });
  },

  stairs(ctx) {
    const { rng } = ctx;
    const { lo, hi } = sourceSpan(ctx);
    const count = rng.int(2, 4);
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < count; attempt++) {
      const length = rng.int(4, 8);
      const dir = rng.pick([1, -1]);
      const r0 = rng.int(ctx.top + 2, ctx.bottom - length - 2);
      const c0 = dir > 0 ? rng.int(lo + 1, hi - length) : rng.int(lo + length, hi - 1);
      const c1 = c0 + dir * (length - 1);
      if (!wallFree(ctx, r0, Math.min(c0, c1), r0 + length - 1, Math.max(c0, c1), 2)) continue;
      for (let i = 0; i < length; i++) setCell(ctx, r0 + i, c0 + dir * i, WALL);
      placed++;
    }
  },
};

function buildStructures(ctx) {
  const { rng, profile } = ctx;
  const entries = Object.entries(profile.structureWeights);
  const count = rng.int(...profile.structureCount);
  const chosen = [];
  while (chosen.length < count) {
    const name = rng.weighted(entries.filter(([key]) => !chosen.includes(key)));
    chosen.push(name);
  }
  // Most maps get at least one express lane up to the pocket.
  const express = ['chutes', 'funnel', 'gutters'];
  if (!chosen.some(name => express.includes(name)) && rng.chance(profile.expressChance)) {
    chosen[chosen.length - 1] = rng.weighted(express.map(name => [name, profile.structureWeights[name]]));
  }
  // Big carvers first, small decorations last, so lanes keep their walls.
  const order = ['ring', 'vault', 'baffles', 'stairs', 'pillars', 'galleries', 'funnel', 'chutes', 'gutters'];
  chosen.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const name of chosen) STRUCTURES[name](ctx);
  ctx.structures = chosen;
}

// ---------------------------------------------------------------------------
// 3. Specials: bombs (chain-reaction fuses), boosters, x2 / +3
// ---------------------------------------------------------------------------

function breakableCells(ctx, predicate = () => true) {
  const { lo, hi } = sourceSpan(ctx);
  const cells = [];
  for (let r = ctx.top; r <= ctx.bottom; r++) {
    for (let c = lo; c <= hi; c++) {
      if (ARMOR.has(ctx.m[r][c]) && predicate(r, c)) cells.push([r, c]);
    }
  }
  return cells;
}

function placeBombs(ctx) {
  const { rng, profile } = ctx;
  const halved = ctx.symmetry === 'none' ? 1 : 0.5;
  const budget = Math.max(2, Math.round(rng.int(...profile.bombs) * halved));
  ctx.bombStyle = rng.weighted([['fuse', 4], ['scatter', 2], ['clusters', 2], ['lines', 2]]);
  const { lo, hi } = sourceSpan(ctx);
  const isArmor = (r, c) => c >= lo && c <= hi && ARMOR.has(getCell(ctx, r, c));
  let placed = 0;
  const place = (r, c) => {
    if (placed >= budget * 2 || !isArmor(r, c)) return false;
    ctx.m[r][c] = '6';
    placed++;
    return true;
  };

  if (ctx.bombStyle === 'fuse') {
    // Random walks of touching bombs: one hit sets off a rolling cascade.
    for (let fuse = 0; fuse < 2 && placed < budget * 2; fuse++) {
      const starts = breakableCells(ctx);
      if (!starts.length) break;
      let [r, c] = rng.pick(starts);
      const length = rng.int(Math.max(4, budget), budget + 6);
      for (let step = 0; step < length; step++) {
        place(r, c);
        const options = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && isArmor(r + dr, c + dc)) options.push([r + dr, c + dc]);
        }
        if (!options.length) break;
        [r, c] = rng.pick(options);
      }
    }
  } else if (ctx.bombStyle === 'lines') {
    for (let line = 0; line < 2; line++) {
      const [r, c] = rng.pick(breakableCells(ctx)) ?? [];
      if (r === undefined) break;
      const length = rng.int(4, 9);
      for (let k = 0; k < length; k++) place(r, c + k);
    }
  } else if (ctx.bombStyle === 'clusters') {
    for (let cluster = 0; cluster < Math.ceil(budget / 4); cluster++) {
      const [r, c] = rng.pick(breakableCells(ctx)) ?? [];
      if (r === undefined) break;
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) place(r + dr, c + dc);
    }
  } else {
    for (const [r, c] of rng.sample(breakableCells(ctx), budget)) place(r, c);
  }

  // Vault and ring cores hold a small bomb plus-shape.
  for (const core of ctx.cores) {
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isArmor(core.row + dr, core.col + dc)) ctx.m[core.row + dr][core.col + dc] = '6';
    }
  }
}

function placePowerups(ctx) {
  const { rng, profile } = ctx;
  const halved = ctx.symmetry === 'none' ? 1 : 0.5;
  // Opener: the first brick a straight launch from the paddle centre meets is
  // a +3, with a x2 stacked right above it, so the swarm starts in seconds.
  const exposed = breakableCells(ctx, (r, c) => r === ctx.rows - 1 || getCell(ctx, r + 1, c) === EMPTY);
  const centre = ctx.cols / 2;
  const ranked = exposed
    .map(([r, c]) => ({ r, c, score: Math.abs(c + 0.5 - centre) + (ctx.bottom - r) * 0.35 }))
    .sort((a, b) => a.score - b.score);
  const opener = ranked[0];
  if (opener) {
    ctx.m[opener.r][opener.c] = '8';
    let above = opener.r - 1;
    while (above >= ctx.top && getCell(ctx, above, opener.c) === EMPTY) above--;
    if (ARMOR.has(getCell(ctx, above, opener.c))) ctx.m[above][opener.c] = '7';
    else if (ranked[1]) ctx.m[ranked[1].r][ranked[1].c] = '7';
  }
  // A second pair waits on the flanks near the entry.
  const flank = rng.sample(exposed.filter(([r, c]) => r >= ctx.bottom - 6 && Math.abs(c + 0.5 - centre) > 6), 2);
  flank.forEach(([r, c], index) => { if (ARMOR.has(ctx.m[r][c])) ctx.m[r][c] = index === 0 ? '7' : '8'; });

  const interiorCount = Math.max(2, Math.round(rng.int(...profile.interiorPowerups) * halved));
  const interior = rng.sample(breakableCells(ctx, r => r < ctx.bottom - 6), interiorCount);
  interior.forEach(([r, c], index) => { ctx.m[r][c] = index % 2 ? '8' : '7'; });

  for (const core of ctx.cores) {
    for (const [dr, dc] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const cell = getCell(ctx, core.row + dr, core.col + dc);
      if (cell && ARMOR.has(cell)) {
        ctx.m[core.row + dr][core.col + dc] = rng.pick(['7', '8']);
        break;
      }
    }
  }

  const boosters = rng.sample(breakableCells(ctx), Math.max(1, Math.round(rng.int(...profile.boosters) * halved)));
  for (const [r, c] of boosters) ctx.m[r][c] = '5';

  // Shields sit in the middle of the field: they fire once the swarm is big.
  const middle = breakableCells(ctx, r => r > ctx.top + 4 && r < ctx.bottom - 4);
  const shields = rng.sample(middle, Math.max(1, Math.round(rng.int(...profile.shields) * halved)));
  for (const [r, c] of shields) ctx.m[r][c] = '9';
}

// ---------------------------------------------------------------------------
// 4. Symmetry, connectivity repair, colors
// ---------------------------------------------------------------------------

/** Copy target of a source-half column. */
function mirrorColumn(ctx, col) {
  if (ctx.symmetry === 'mirror') return ctx.cols - 1 - col;
  if (ctx.symmetry === 'echo') return col + ctx.cols / 2;
  return null;
}

/** The symmetric partner of any column, in either half. */
function twinColumn(ctx, col) {
  const half = ctx.cols / 2;
  if (ctx.symmetry === 'mirror') return ctx.cols - 1 - col;
  if (ctx.symmetry === 'echo') return col < half ? col + half : col - half;
  return null;
}

function applySymmetry(ctx) {
  if (ctx.symmetry === 'none') return;
  const half = ctx.cols / 2;
  for (let r = 0; r < ctx.rows; r++) {
    for (let c = 0; c < half; c++) {
      const target = mirrorColumn(ctx, c);
      ctx.m[r][target] = ctx.m[r][c];
      ctx.bands[r][target] = ctx.bands[r][c];
    }
  }
  const copies = [];
  for (const corridor of ctx.corridors) {
    if (corridor.chuteCol !== undefined) {
      const col = mirrorColumn(ctx, corridor.chuteCol);
      copies.push({ ...corridor, chuteCol: col, leftWallCol: col - 1, rightWallCol: col + 1 });
    } else {
      const a = mirrorColumn(ctx, corridor.startCol);
      const b = mirrorColumn(ctx, corridor.endCol);
      copies.push({ ...corridor, startCol: Math.min(a, b), endCol: Math.max(a, b) });
    }
  }
  ctx.corridors.push(...copies);
}

/** Later structures may wall over an earlier lane; crossings become junctions. */
function reopenCorridors(ctx) {
  for (const corridor of ctx.corridors) {
    if (corridor.chuteCol !== undefined) {
      for (let r = corridor.startRow; r <= corridor.endRow; r++) setCell(ctx, r, corridor.chuteCol, EMPTY);
    } else {
      for (let c = corridor.startCol; c <= corridor.endCol; c++) setCell(ctx, corridor.chuteRow, c, EMPTY);
    }
  }
}

/**
 * Cell-level flood from below the grid through every non-wall cell. Bricks
 * count as passable because they can be destroyed; the 40 px strip above
 * row 0 is open play space. Any pocket the flood misses gets the cheapest
 * wall path opened as a breakable door (mirrored to keep the symmetry).
 */
function repairConnectivity(ctx) {
  const { rows, cols } = ctx;
  const H = rows + 2; // virtual open rows above (-1) and below (rows)
  const idx = (r, c) => (r + 1) * cols + c;
  const isWall = (r, c) => r >= 0 && r < rows && ctx.m[r][c] === WALL;
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let pass = 0; pass < 80; pass++) {
    const reached = new Uint8Array(H * cols);
    const queue = [];
    for (let c = 0; c < cols; c++) {
      reached[idx(rows, c)] = 1;
      queue.push([rows, c]);
    }
    for (let head = 0; head < queue.length; head++) {
      const [r, c] = queue[head];
      for (const [dr, dc] of neighbours) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < -1 || nr > rows || nc < 0 || nc >= cols) continue;
        if (reached[idx(nr, nc)] || isWall(nr, nc)) continue;
        reached[idx(nr, nc)] = 1;
        queue.push([nr, nc]);
      }
    }

    let sealed = null;
    for (let r = -1; r < rows && !sealed; r++) {
      for (let c = 0; c < cols; c++) {
        if (!reached[idx(r, c)] && !isWall(r, c)) { sealed = [r, c]; break; }
      }
    }
    if (!sealed) return;

    // 0-1 BFS: stepping into a wall costs 1; stop at the first reached cell.
    const cost = new Int32Array(H * cols).fill(-1);
    const parent = new Int32Array(H * cols).fill(-1);
    const deque = [sealed];
    cost[idx(...sealed)] = 0;
    let target = null;
    while (deque.length) {
      const [r, c] = deque.shift();
      if (reached[idx(r, c)]) { target = [r, c]; break; }
      for (const [dr, dc] of neighbours) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < -1 || nr > rows || nc < 0 || nc >= cols) continue;
        const step = isWall(nr, nc) ? 1 : 0;
        const next = cost[idx(r, c)] + step;
        if (cost[idx(nr, nc)] !== -1 && cost[idx(nr, nc)] <= next) continue;
        cost[idx(nr, nc)] = next;
        parent[idx(nr, nc)] = idx(r, c);
        if (step) deque.push([nr, nc]); else deque.unshift([nr, nc]);
      }
    }
    if (!target) return;
    for (let at = idx(...target); at !== -1; at = parent[at]) {
      const r = Math.floor(at / cols) - 1;
      const c = at % cols;
      if (!isWall(r, c)) continue;
      ctx.m[r][c] = '2';
      const twin = twinColumn(ctx, c);
      if (twin !== null && ctx.m[r][twin] === WALL) ctx.m[r][twin] = '2';
    }
  }
}

function computeTints(ctx) {
  const { rng, rows, cols, top, bottom } = ctx;
  const n = THEME_COLOR_COUNT;
  ctx.tintMode = MOTIFS[ctx.motif].bandTints
    ? 'band'
    : rng.weighted([['band', 4], ['rows', 2], ['radial', 2], ['diagonal', 2], ['mirror', 1]]);
  const shift = rng.int(0, n - 1);
  const cx = (cols * CELL_W) / 2;
  const cy = (py(top) + py(bottom)) / 2;
  const maxD = Math.hypot(cx, (bottom - top + 1) * CELL_H / 2);
  const tints = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      if (!BREAKABLE.has(ctx.m[r][c])) { line += '0'; continue; }
      let t;
      if (ctx.tintMode === 'rows') t = (r - top) / Math.max(1, bottom - top);
      else if (ctx.tintMode === 'radial') t = Math.hypot(px(c) - cx, py(r) - cy) / maxD;
      else if (ctx.tintMode === 'diagonal') t = ((r - top) / Math.max(1, bottom - top)) * 0.6 + (c / cols) * 0.4;
      else if (ctx.tintMode === 'mirror') t = Math.abs(c + 0.5 - cols / 2) / (cols / 2);
      const index = t === undefined
        ? mod(ctx.bands[r][c] + shift, n)
        : clamp(Math.floor(t * n), 0, n - 1);
      line += index.toString(36);
    }
    tints.push(line);
  }
  return tints;
}

function countLayout(layout) {
  const counts = {};
  for (const row of layout) for (const ch of row) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapFingerprint(layout) {
  return hashString(layout.join('\n')).toString(16).padStart(8, '0');
}

function attemptMap(seedText, difficulty, attempt, { structures = true } = {}) {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const rng = createRng(attempt === 0 ? seedText : `${seedText}#${attempt}`);
  const rows = MAP_ROWS;
  const cols = MAP_COLS;
  const ctx = {
    rng, profile, rows, cols,
    m: makeGrid(rows, cols, EMPTY),
    bands: makeGrid(rows, cols, 0),
    top: rng.int(3, 9),
    bottom: rng.int(rows - 10, rows - 2),
    symmetry: rng.weighted([['mirror', 6], ['echo', 1.5], ['none', 2.5]]),
    corridors: [],
    cores: [],
    structures: [],
  };

  buildField(ctx);
  if (structures) buildStructures(ctx);
  placeBombs(ctx);
  placePowerups(ctx);
  applySymmetry(ctx);
  reopenCorridors(ctx);
  repairConnectivity(ctx);

  const paletteName = rng.pick(PALETTE_NAMES);
  const theme = buildTheme(paletteName, rng.chance(0.4));
  const tints = computeTints(ctx);
  const layout = ctx.m.map(row => row.join(''));
  const counts = countLayout(layout);
  const breakables = layout.join('').split('').filter(ch => BREAKABLE.has(ch)).length;
  const armorHp = (counts['1'] || 0) + 2 * (counts['2'] || 0) + 3 * (counts['3'] || 0)
    + (counts['5'] || 0) + (counts['6'] || 0) + (counts['7'] || 0) + (counts['8'] || 0) + (counts['9'] || 0);

  const word = rng.pick(PALETTES[paletteName].words);
  const noun = ctx.motif === 'sprite' ? ctx.spriteName : MOTIFS[ctx.motif].noun;
  const structureText = ctx.structures.map(name => STRUCTURE_LABELS[name]).join(' + ') || 'Open Field';
  const fingerprint = mapFingerprint(layout);
  const [speedLo, speedHi] = profile.speed;

  return {
    id: `gen-${fingerprint}`,
    generated: true,
    seed: seedText,
    difficulty: profile.label,
    difficultyKey: difficulty,
    name: `${word} ${noun}`,
    subtitle: `${SYMMETRY_LABELS[ctx.symmetry]} · ${structureText}`,
    description: `Procedural ${MOTIFS[ctx.motif].noun ?? 'sprite'} map with ${ctx.bombStyle} bombs. Seed ${seedText}.`,
    cols,
    rows,
    ballInitialSpeed: Math.round(rng.float(speedLo, speedHi)),
    corridors: ctx.corridors,
    theme,
    tints,
    layout,
    recipe: {
      motif: ctx.motif,
      layer: ctx.layer,
      sprite: ctx.spriteName ?? null,
      symmetry: ctx.symmetry,
      structures: [...ctx.structures],
      bombStyle: ctx.bombStyle,
      palette: paletteName,
      tintMode: ctx.tintMode,
      top: ctx.top,
      bottom: ctx.bottom,
    },
    signature: [ctx.motif, ctx.layer ?? '-', ctx.symmetry, [...ctx.structures].sort().join('+')].join('|'),
    fingerprint,
    stats: {
      breakables,
      walls: counts[WALL] || 0,
      bombs: counts['6'] || 0,
      boosters: counts['5'] || 0,
      doublers: counts['7'] || 0,
      extraBalls: counts['8'] || 0,
      shields: counts['9'] || 0,
      armorHp,
      attempt,
    },
  };
}

const VALIDATION_CONFIG = { arena: { width: MAP_COLS * CELL_W, height: 720 }, ballRadius: 4.5 };

/** Runs the shared ball-clearance flood plus count checks on a generated map. */
export function validateGeneratedMap(def) {
  const problems = [];
  const profile = DIFFICULTY_PROFILES[def.difficultyKey] ?? DIFFICULTY_PROFILES.normal;
  const [minBreakables, maxBreakables] = profile.breakables;
  if (def.stats.breakables < minBreakables) problems.push(`too few breakables (${def.stats.breakables})`);
  if (def.stats.breakables > maxBreakables) problems.push(`too many breakables (${def.stats.breakables})`);
  if (!def.stats.doublers || !def.stats.extraBalls) problems.push('missing x2 or +3 bricks');
  if (problems.length) return { ok: false, problems }; // skip the costly flood
  const built = new LevelManager([def]).buildGridForLevel(def, VALIDATION_CONFIG);
  const clearance = analyzeBallClearance(built, VALIDATION_CONFIG);
  if (clearance.unreachableBricks.length) problems.push(`${clearance.unreachableBricks.length} unreachable bricks`);
  if (clearance.unreachableCorridorPoints.length) problems.push(`${clearance.unreachableCorridorPoints.length} blocked corridor points`);
  return { ok: problems.length === 0, problems };
}

/**
 * Generates one procedural map. Same seed + difficulty -> same map.
 * @param {Object} [options]
 * @param {string} [options.seed] Any text; a random code when omitted.
 * @param {string} [options.difficulty] 'chill' | 'normal' | 'hard'.
 * @returns {Object} Level definition compatible with LevelManager/GameEngine.
 */
export function generateMap({ seed = makeSeedCode(), difficulty = 'normal' } = {}) {
  const key = DIFFICULTY_PROFILES[difficulty] ? difficulty : 'normal';
  const seedText = String(seed);
  let last = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const def = attemptMap(seedText, key, attempt);
    if (validateGeneratedMap(def).ok) return def;
    last = def;
  }
  // Extremely unlikely: fall back to a wall-free field, which cannot seal anything.
  for (let attempt = 16; attempt < 32; attempt++) {
    const def = attemptMap(seedText, key, attempt, { structures: false });
    if (validateGeneratedMap(def).ok) return def;
    last = def;
  }
  return last;
}

/**
 * Endless, deterministic run of generated maps. Neighbouring maps never
 * reuse the same motif (last 3), palette (last 1) or recipe signature
 * (last `recentWindow`), and no layout fingerprint ever repeats.
 */
export class MapSequence {
  constructor({ seed = makeSeedCode(), difficulty = 'normal', avoid = [], recentWindow = 8 } = {}) {
    this.seed = String(seed);
    this.difficulty = DIFFICULTY_PROFILES[difficulty] ? difficulty : 'normal';
    this.recentWindow = recentWindow;
    this.index = 0;
    this.seen = new Set(avoid);
    this.history = [];
  }

  isTooSimilar(def) {
    const recent = this.history.slice(-this.recentWindow);
    if (recent.some(item => item.signature === def.signature)) return true;
    if (recent.slice(-3).some(item => item.recipe.motif === def.recipe.motif)) return true;
    const previous = recent[recent.length - 1];
    return Boolean(previous && previous.recipe.palette === def.recipe.palette);
  }

  next() {
    let chosen = null;
    let fallback = null;
    for (let reroll = 0; reroll < 40; reroll++) {
      const mapSeed = reroll === 0 ? `${this.seed}/${this.index + 1}` : `${this.seed}/${this.index + 1}~${reroll}`;
      const def = generateMap({ seed: mapSeed, difficulty: this.difficulty });
      fallback = def;
      if (this.seen.has(def.fingerprint)) continue;
      chosen ??= def;
      if (!this.isTooSimilar(def)) {
        chosen = def;
        break;
      }
    }
    chosen ??= fallback;
    this.index++;
    this.seen.add(chosen.fingerprint);
    this.history.push({ signature: chosen.signature, recipe: chosen.recipe, fingerprint: chosen.fingerprint });
    if (this.history.length > 64) this.history.shift();
    return { ...chosen, runSeed: this.seed, runIndex: this.index };
  }
}

export default generateMap;
