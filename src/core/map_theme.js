/**
 * Color themes for procedurally generated maps.
 *
 * A generated level stores its resolved palette (`theme.colors`) and a
 * per-cell palette index grid (`tints`), so any renderer (browser canvas,
 * headless PNG preview, future video recorder) paints identical colors
 * without re-running the generator.
 *
 * Pure ES Module - Zero external dependencies.
 */

export const PALETTES = Object.freeze({
  sunset: { stops: ['#ff5f6d', '#ff9966', '#ffc371'], background: '#160b1a', words: ['Sunset', 'Dusk', 'Amber'] },
  ocean: { stops: ['#4f46e5', '#0072ff', '#00c6ff', '#7df9ff'], background: '#050f1f', words: ['Abyssal', 'Tidal', 'Cobalt'] },
  neon: { stops: ['#f72585', '#b5179e', '#7209b7', '#4361ee', '#4cc9f0'], background: '#0d0221', words: ['Neon', 'Electric', 'Hyper'] },
  aurora: { stops: ['#00f5a0', '#00d9f5', '#7f5af0'], background: '#04141a', words: ['Aurora', 'Polar', 'Boreal'] },
  ember: { stops: ['#ffe066', '#f77f00', '#d62828', '#9d0208'], background: '#170806', words: ['Molten', 'Ember', 'Inferno'] },
  candy: { stops: ['#ff99c8', '#fcf6bd', '#a9def9', '#e4c1f9'], background: '#161022', words: ['Candy', 'Sugar', 'Pastel'] },
  forest: { stops: ['#d9ed92', '#76c893', '#34a0a4', '#1a759f'], background: '#06140f', words: ['Verdant', 'Jungle', 'Moss'] },
  rainbow: { stops: ['#ff4d4d', '#ffb84d', '#fff04d', '#5cff5c', '#4dd2ff', '#9d6bff', '#ff6bd5'], background: '#0b0b14', words: ['Prism', 'Rainbow', 'Spectral'] },
  gold: { stops: ['#fff3b0', '#fde047', '#f59e0b', '#b45309'], background: '#0c0f1d', words: ['Golden', 'Gilded', 'Royal'] },
  ice: { stops: ['#f0fbff', '#a5e4ff', '#5fa8d3', '#3d5a80'], background: '#070d17', words: ['Frost', 'Crystal', 'Arctic'] },
  synthwave: { stops: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'], background: '#0a0418', words: ['Retro', 'Synth', 'Outrun'] },
  mint: { stops: ['#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'], background: '#0b1016', words: ['Mint', 'Dream', 'Cloud'] },
});

export const PALETTE_NAMES = Object.freeze(Object.keys(PALETTES));

/** Number of palette entries stored on a generated theme. */
export const THEME_COLOR_COUNT = 6;

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex([r, g, b]) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Samples `count` evenly spaced colors along a multi-stop gradient. */
export function samplePalette(stops, count = THEME_COLOR_COUNT) {
  const rgbStops = stops.map(hexToRgb);
  const colors = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const scaled = t * (rgbStops.length - 1);
    const index = Math.min(rgbStops.length - 2, Math.floor(scaled));
    colors.push(rgbToHex(mixRgb(rgbStops[index], rgbStops[index + 1], scaled - index)));
  }
  return colors;
}

/**
 * Builds the serializable theme block stored on a generated level.
 * @param {string} paletteName Key of PALETTES.
 * @param {boolean} [reversed] Flip gradient direction.
 */
export function buildTheme(paletteName, reversed = false) {
  const palette = PALETTES[paletteName] ?? PALETTES.gold;
  const stops = reversed ? [...palette.stops].reverse() : palette.stops;
  const background = palette.background;
  const bg = hexToRgb(background);
  return {
    palette: paletteName,
    colors: samplePalette(stops, THEME_COLOR_COUNT),
    background,
    wall: rgbToHex(mixRgb(bg, [100, 116, 139], 0.55)),
    wallEdge: rgbToHex(mixRgb(bg, [203, 213, 225], 0.7)),
  };
}

/** Fill for a themed breakable brick, darkened by its remaining armor. */
const HP_SHADE = [1, 1, 0.74, 0.54];

export function themedBrickRgb(theme, tintIndex, hp) {
  const colors = theme?.colors;
  if (!colors || colors.length === 0) return null;
  const base = hexToRgb(colors[Math.max(0, Math.min(colors.length - 1, tintIndex || 0))]);
  const shade = HP_SHADE[Math.max(1, Math.min(3, Math.round(hp) || 1))];
  return base.map(channel => channel * shade);
}

/** Palette index for a cell of a level that carries a `tints` grid. */
export function tintAt(levelDef, row, col) {
  const line = levelDef?.tints?.[row];
  if (!line) return 0;
  const value = parseInt(line[col], 36);
  return Number.isNaN(value) ? 0 : value;
}
