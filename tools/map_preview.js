/**
 * Headless map thumbnails: paints a level definition into an RGBA buffer
 * with the same palette rules as the canvas renderer, and encodes PNGs with
 * node:zlib only (no canvas or image libraries).
 */

import { deflateSync } from 'node:zlib';
import { BRICK_TYPES } from '../src/config.js';
import { hexToRgb, themedBrickRgb, tintAt } from '../src/core/map_theme.js';

const CELL_W = 15;
const CELL_H = 11;
const GRID_TOP = 40;

const SPECIAL_RGB = {
  5: hexToRgb(BRICK_TYPES[5].color),
  6: hexToRgb(BRICK_TYPES[6].color),
  7: hexToRgb(BRICK_TYPES[7].color),
  8: hexToRgb(BRICK_TYPES[8].color),
  9: hexToRgb(BRICK_TYPES[9].color),
};

export class RgbaImage {
  constructor(width, height, background = [12, 15, 29]) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    this.fillRect(0, 0, width, height, background);
  }

  fillRect(x, y, w, h, [r, g, b], alpha = 1) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 4;
        this.data[i] = this.data[i] + (r - this.data[i]) * alpha;
        this.data[i + 1] = this.data[i + 1] + (g - this.data[i + 1]) * alpha;
        this.data[i + 2] = this.data[i + 2] + (b - this.data[i + 2]) * alpha;
        this.data[i + 3] = 255;
      }
    }
  }

  /** Copies another image in at (dx, dy), nearest-neighbour scaled. */
  blit(source, dx, dy, scale = 1) {
    const w = Math.round(source.width * scale);
    const h = Math.round(source.height * scale);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        const si = (Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4;
        const ti = (ty * this.width + tx) * 4;
        source.data.copy(this.data, ti, si, si + 4);
      }
    }
  }
}

function brickRgb(def, typeId, row, col) {
  if (typeId === 4) return null;
  if (SPECIAL_RGB[typeId]) return SPECIAL_RGB[typeId];
  if (def.theme && def.tints) return themedBrickRgb(def.theme, tintAt(def, row, col), typeId);
  return hexToRgb(BRICK_TYPES[typeId]?.color || '#F59E0B');
}

/**
 * Paints the brick field of a level (arena width x grid height + margins).
 * @returns {RgbaImage}
 */
export function renderMapPreview(def) {
  const width = def.cols * CELL_W;
  const height = GRID_TOP + def.rows * CELL_H + 20;
  const background = hexToRgb(def.theme?.background || '#0c0f1d');
  const image = new RgbaImage(width, height, background);
  const wall = hexToRgb(def.theme?.wall || '#334155');
  const wallEdge = hexToRgb(def.theme?.wallEdge || '#94A3B8');

  for (let row = 0; row < def.rows; row++) {
    for (let col = 0; col < def.cols; col++) {
      const typeId = parseInt(def.layout[row][col], 10);
      if (!typeId) continue;
      const x = col * CELL_W;
      const y = GRID_TOP + row * CELL_H;
      if (typeId === 4) {
        image.fillRect(x, y, CELL_W, CELL_H, wallEdge);
        image.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2, wall);
        continue;
      }
      const rgb = brickRgb(def, typeId, row, col);
      image.fillRect(x, y, CELL_W, CELL_H, [0, 0, 0], 0.45);
      image.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2, rgb);
      image.fillRect(x + 1, y + 1, CELL_W - 2, 3, [255, 255, 255], 0.2);
      if (typeId === 2 || typeId === 3) {
        image.fillRect(x + 2, y + 2, CELL_W - 4, 1, [255, 255, 255], 0.45);
        image.fillRect(x + 2, y + CELL_H - 3, CELL_W - 4, 1, [255, 255, 255], 0.45);
      }
      if (typeId >= 5) image.fillRect(x + 5, y + 3, 5, 5, [255, 255, 255], 0.75);
    }
  }
  // Paddle marker so the thumbnail reads as a play field.
  image.fillRect(width / 2 - 34, height - 10, 68, 5, [56, 189, 248]);
  return image;
}

/** Lays several previews out on one sheet (columns x rows), scaled down. */
export function renderContactSheet(defs, { columns = 4, scale = 0.5, gap = 8 } = {}) {
  const previews = defs.map(renderMapPreview);
  const cellW = Math.round(previews[0].width * scale);
  const cellH = Math.round(previews[0].height * scale);
  const rows = Math.ceil(previews.length / columns);
  const sheet = new RgbaImage(columns * cellW + (columns + 1) * gap, rows * cellH + (rows + 1) * gap, [3, 5, 12]);
  previews.forEach((preview, index) => {
    const x = gap + (index % columns) * (cellW + gap);
    const y = gap + Math.floor(index / columns) * (cellH + gap);
    sheet.blit(preview, x, y, scale);
  });
  return sheet;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes an RgbaImage as a PNG file buffer. */
export function encodePng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
