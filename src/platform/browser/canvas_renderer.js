/**
 * HTML5 Canvas 2D Rendering Pipeline (Milestone 4 - Feature F18)
 * High-performance 60 FPS portrait rendering with neon arcade aesthetic,
 * dynamic particles, comet ball trails, glowing paddle, and state machine overlays.
 *
 * Pure ES Module - Zero external dependencies.
 */

import { DEFAULT_CONFIG, BRICK_TYPES, GAME_STATUS } from '../../config.js';
import { themedBrickRgb, rgbToHex } from '../../core/map_theme.js';

/**
 * Helper to safely draw a rounded rectangle across all environments (including mock Canvas in tests).
 */
function drawRoundRect(ctx, x, y, width, height, radius = 4) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  // Fallback for older browsers or mock test context
  ctx.beginPath();
  if (typeof ctx.arcTo === 'function') {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  } else {
    ctx.rect(x, y, width, height);
  }
}

export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement|Object} canvas - HTML Canvas element or mock object.
   * @param {Object} [config] - Optional configuration overrides.
   */
  constructor(canvas, config = DEFAULT_CONFIG) {
    this.canvas = canvas;
    this.config = config;
    this.ctx = canvas?.getContext?.('2d') || canvas?.ctx || null;

    // Arena dimensions
    this.width = config.arena?.width || 480;
    this.height = config.arena?.height || 720;

    // Visual particles and trails
    this.particles = [];
    this.ballTrails = new Map(); // ballId -> Array of { x, y, radius, alpha }
    this.maxTrailLength = 12;

    // Animation timer for pulsing glows
    this.animTime = 0;
    this.powerupNotice = null;
    this.renderedState = null;

    // Juice: popping bricks, blast rings, screen shake, map intro card
    this.pops = [];
    this.rings = [];
    this.shake = 0;
    this.intro = null;
    this.currentTheme = null;
    this.themeCache = new Map();
    this.themeCacheOwner = null;
  }

  /** Cached CSS color for a themed brick at a given armor level. */
  themeColor(theme, tint, hp) {
    if (this.themeCacheOwner !== theme) {
      this.themeCache = new Map();
      this.themeCacheOwner = theme;
    }
    const level = Math.max(1, Math.min(3, Math.round(hp) || 1));
    const key = (tint || 0) * 4 + level;
    let color = this.themeCache.get(key);
    if (!color) {
      color = rgbToHex(themedBrickRgb(theme, tint, level));
      this.themeCache.set(key, color);
    }
    return color;
  }

  /** Color a brick shows right now (used for its pop-out ghost). */
  displayColor(brick) {
    if (brick.tint !== undefined && this.currentTheme && brick.type <= 3) {
      return this.themeColor(this.currentTheme, brick.tint, 1);
    }
    return BRICK_TYPES[brick.type]?.color || brick.color || '#F59E0B';
  }

  setNotice(text, color, seconds = 1.8) {
    this.powerupNotice = { text, color, remaining: seconds };
  }

  addBlast(brick) {
    if (!brick) return;
    this.rings.push({ x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, life: 0, maxLife: 0.32 });
    if (this.rings.length > 48) this.rings.shift();
    this.shake = Math.min(7, this.shake + 2.2);
  }

  /**
   * Spawns an explosion of particles at a given coordinate.
   * @param {number} x - Center X.
   * @param {number} y - Center Y.
   * @param {string} color - Particle base color.
   * @param {number} count - Number of particles.
   * @param {number} speedMult - Speed multiplier.
   */
  emitExplosion(x, y, color = '#F59E0B', count = 12, speedMult = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = (60 + Math.random() * 140) * speedMult;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2.0 + Math.random() * 2.5,
        alpha: 1.0,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25
      });
    }
  }

  /**
   * Spawns particle burst for a destroyed or damaged brick.
   * @param {Object} brick - Brick object.
   */
  emitBrickParticles(brick) {
    if (!brick) return;
    const cx = brick.x + brick.width / 2;
    const cy = brick.y + brick.height / 2;
    let color = brick.color || '#F59E0B';
    let count = 10;
    let speedMult = 1.0;

    if (brick.type === 6) {
      // Bomb: massive blast
      color = '#C084FC';
      count = 28;
      speedMult = 1.8;
    } else if (brick.type === 5) {
      // Booster: electric cyan burst
      color = '#22D3EE';
      count = 16;
      speedMult = 1.4;
    } else if (brick.type === 4) {
      // Corridor wall spark
      color = '#E2E8F0';
      count = 6;
      speedMult = 0.8;
    }

    this.emitExplosion(cx, cy, color, count, speedMult);
  }

  /**
   * Ingests gameplay events to trigger visual effects (sparks, explosions).
   * @param {Array} events - Event list from stepPhysics / GameEngine.
   */
  processEvents(events) {
    if (!Array.isArray(events)) return;
    let shieldSparks = 0;
    for (const ev of events) {
      if (!ev) continue;
      if (ev.type === 'BRICK_HIT') {
        if (ev.destroyed && ev.brick) {
          const b = ev.brick;
          if (this.pops.length < 400) {
            this.pops.push({ x: b.x, y: b.y, w: b.width, h: b.height, color: this.displayColor(b), life: 0, maxLife: 0.2 });
          }
          if (b.type === 6 && ev.source !== 'BOMB_BLAST') this.addBlast(b);
        }
        if (ev.destroyed || ev.brick?.type === 4) {
          this.emitBrickParticles(ev.brick);
        } else {
          // Subtle spark on hit
          const bx = ev.brick ? ev.brick.x + ev.brick.width / 2 : 240;
          const by = ev.brick ? ev.brick.y + ev.brick.height / 2 : 200;
          this.emitExplosion(bx, by, ev.brick?.color || '#FBBF24', 4, 0.6);
        }
      } else if (ev.type === 'PADDLE_HIT') {
        const ball = ev.ball;
        if (ball) {
          this.emitExplosion(ball.x, ball.y, '#38BDF8', 6, 0.7);
        }
      } else if (ev.type === 'BOMB_CHAIN') {
        this.addBlast(ev.brick);
        if ((ev.depth || 0) >= 3) this.setNotice(`CHAIN ×${ev.depth}`, '#C084FC', 1.0);
      } else if (ev.type === 'PICKUP_SPAWNED') {
        const appearance = this.pickupAppearance(ev.pickup?.type);
        if (appearance && !this.powerupNotice) {
          this.setNotice(`CATCH ${appearance.label} WITH THE PADDLE`, appearance.color, 1.3);
        }
      } else if (ev.type === 'PICKUP_COLLECTED') {
        const pickup = ev.pickup;
        const appearance = this.pickupAppearance(pickup?.type);
        if (pickup && appearance) this.emitExplosion(pickup.x, pickup.y, appearance.color, 16, 1.1);
      } else if (ev.type === 'PICKUP_MISSED') {
        if (ev.pickup) this.emitExplosion(ev.pickup.x, Math.min(this.height - 4, ev.pickup.y), '#64748B', 4, 0.4);
      } else if (ev.type === 'SHIELD_UP') {
        this.setNotice(`SHIELD  ·  ${Math.ceil(ev.seconds)}s`, '#7DD3FC');
        if (ev.brick && !ev.pickup) this.emitExplosion(ev.brick.x + ev.brick.width / 2, ev.brick.y + ev.brick.height / 2, '#BAE6FD', 18, 1.4);
      } else if (ev.type === 'SHIELD_HIT') {
        if (ev.ball && shieldSparks++ < 3) this.emitExplosion(ev.ball.x, ev.ball.y + ev.ball.radius, '#7DD3FC', 5, 0.6);
      } else if (ev.type === 'SEEKER_ON') {
        this.setNotice('SEEKER  ·  HUNTING LAST BRICKS', '#F472B6', 2.2);
      } else if (ev.type === 'MULTIBALL') {
        const color = ev.powerup === 'BALL_DOUBLER' ? '#84CC16' : '#EC4899';
        const label = ev.powerup === 'BALL_DOUBLER' ? 'BALLS ×2' : 'BALLS +3';
        this.powerupNotice = {
          text: ev.spawnedCount > 0 ? `${label}  ·  ${ev.activeCount} IN PLAY` : `${label}  ·  BALL LIMIT`,
          color,
          remaining: 1.8
        };
        if (ev.brick && !ev.pickup) {
          this.emitExplosion(ev.brick.x + ev.brick.width / 2, ev.brick.y + ev.brick.height / 2, color, 20, 1.5);
        }
      }
    }
  }

  /**
   * Updates particle positions and lifetimes.
   * @param {number} dt - Time step in seconds.
   */
  updateParticles(dt = 1 / 60) {
    this.animTime += dt;
    if (this.powerupNotice) {
      this.powerupNotice.remaining -= dt;
      if (this.powerupNotice.remaining <= 0) this.powerupNotice = null;
    }
    if (this.intro) {
      this.intro.remaining -= dt;
      if (this.intro.remaining <= 0) this.intro = null;
    }
    this.shake = Math.max(0, this.shake - 28 * dt);
    const age = item => { item.life += dt; return item.life < item.maxLife; };
    this.pops = this.pops.filter(age);
    this.rings = this.rings.filter(age);
    const active = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life < p.maxLife) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);
        active.push(p);
      }
    }
    this.particles = active;
  }

  /**
   * Main render call. Paints entire scene according to GameState.
   * @param {Object} state - Pure GameState object.
   * @param {Array} [events] - Optional event list to trigger particles.
   * @param {number} [dt] - Delta time for particle updates.
   */
  render(state, events = [], dt = 1 / 60) {
    if (!this.ctx || !state) return;
    const ctx = this.ctx;

    if (this.renderedState !== state) {
      this.ballTrails.clear();
      this.particles = [];
      this.pops = [];
      this.rings = [];
      this.shake = 0;
      this.powerupNotice = null;
      // A new GameState means a new or restarted map: show its title card.
      this.intro = { remaining: 2.8, total: 2.8 };
      this.renderedState = state;
    }
    this.currentTheme = state.theme || null;

    // Process event-driven visual effects
    if (events && events.length > 0) {
      this.processEvents(events);
    }
    this.updateParticles(dt);

    const width = state.arena?.width || this.width;
    const height = state.arena?.height || this.height;

    // 1. Arena Dark Background & High-Tech Scanline Effect
    this.drawBackground(ctx, width, height, state.theme);

    // World layers shake together after bomb blasts; the HUD stays still.
    ctx.save();
    if (this.shake > 0.05 && typeof ctx.translate === 'function') {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // 2. Bricks Matrix, popping ghosts, and blast rings
    this.drawBricks(ctx, state);
    this.drawPops(ctx);

    // 3. Particles
    this.drawParticles(ctx);

    // 4. Shield floor, Ball Trails and Balls
    this.drawShield(ctx, state, width, height);
    this.drawBalls(ctx, state);
    this.drawPickups(ctx, state);

    // 5. Paddle (with AI autonomous glow indicator)
    this.drawPaddle(ctx, state);
    ctx.restore();

    // 6. Top HUD
    this.drawHUD(ctx, state);
    this.drawPowerupNotice(ctx, state);

    // 7. State Machine Overlays (READY, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY)
    this.drawStateOverlay(ctx, state, width, height);
    this.drawIntro(ctx, state, width);
  }

  /** Bricks swell and fade for a moment after they break. */
  drawPops(ctx) {
    if (this.pops.length === 0 && this.rings.length === 0) return;
    ctx.save();
    for (const pop of this.pops) {
      const t = pop.life / pop.maxLife;
      const grow = 1 + 0.45 * t;
      const w = pop.w * grow;
      const h = pop.h * grow;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = pop.color;
      ctx.fillRect(pop.x + (pop.w - w) / 2, pop.y + (pop.h - h) / 2, w, h);
    }
    ctx.lineWidth = 2;
    for (const ring of this.rings) {
      const t = ring.life / ring.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = t < 0.4 ? '#F5D0FE' : '#C084FC';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 6 + 30 * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Glowing energy floor while a SHIELD brick's timer runs. */
  drawShield(ctx, state, width, height) {
    if (!(state.shield > 0)) return;
    const inset = this.config.rules?.shieldInset ?? DEFAULT_CONFIG.rules.shieldInset;
    const y = height - inset;
    const fading = state.shield < 2;
    const alpha = fading ? (Math.sin(this.animTime * 30) > 0 ? 0.9 : 0.35) : 0.9;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#38BDF8';
    ctx.strokeStyle = '#7DD3FC';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.25;
    ctx.fillStyle = '#7DD3FC';
    ctx.fillRect(0, y, width, inset);
    ctx.restore();
  }

  /** Title card naming the map (and its seed) for the first seconds. */
  drawIntro(ctx, state, width) {
    if (!this.intro) return;
    const elapsed = this.intro.total - this.intro.remaining;
    const alpha = Math.min(1, elapsed / 0.25, this.intro.remaining / 0.5);
    const map = state.map;
    const levelNum = (state.levelIndex || 0) + 1;
    const kicker = map
      ? `RANDOM MAP ${map.runIndex ?? levelNum}  ·  ${map.difficulty}`
      : `LEVEL ${levelNum}${state.levelDifficulty ? '  ·  ' + state.levelDifficulty : ''}`;
    const accent = state.theme?.colors?.[2] || '#38BDF8';

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = 'rgba(8, 10, 20, 0.86)';
    drawRoundRect(ctx, 36, 196, width - 72, map ? 104 : 88, 10);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, 36, 196, width - 72, map ? 104 : 88, 10);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Courier New", monospace, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(kicker, width / 2, 216);
    ctx.font = 'bold 22px "Courier New", monospace, sans-serif';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(state.levelName || 'Brick Breaker', width / 2, 242, width - 90);
    ctx.font = '12px "Courier New", monospace, sans-serif';
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(map?.subtitle || state.levelSubtitle || '', width / 2, 266, width - 90);
    if (map) {
      ctx.font = '11px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`SEED ${map.seed}`, width / 2, 287, width - 90);
    }
    ctx.restore();
  }

  /**
   * Draws dark arcade background with subtle grid and border.
   */
  drawBackground(ctx, width, height, mapTheme = null) {
    ctx.save();
    // High-contrast dark arcade background (#0c0f1d), tinted by generated map themes
    ctx.fillStyle = mapTheme?.background || this.config.theme?.background || '#0c0f1d';
    ctx.fillRect(0, 0, width, height);

    // Subtle arena boundary border
    ctx.strokeStyle = this.config.theme?.border || '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Subtle vertical chute guide lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 60; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws the dense matrix of bricks.
   */
  drawBricks(ctx, state) {
    const bricks = state.bricks;
    if (!Array.isArray(bricks)) return;
    const theme = state.theme;

    ctx.save();

    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (!b.active || b.hp <= 0) continue;

      const x = b.x;
      const y = b.y;
      const w = b.width;
      const h = b.height;

      if (b.type === 4 || b.indestructible) {
        // Corridor Wall: Dark slate (#334155) with crisp silver border (#94A3B8)
        ctx.fillStyle = theme?.wall || '#334155';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = theme?.wallEdge || '#94A3B8';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        // Subtle metallic center groove
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + w * 0.25, y + 1, w * 0.5, h - 2);
      } else if (b.type === 5) {
        // Booster Brick: Electric cyan (#06B6D4) with bright core
        ctx.fillStyle = '#06B6D4';
        ctx.fillRect(x, y, w, h);

        ctx.fillStyle = '#A5F3FC';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

        ctx.strokeStyle = '#0891B2';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (b.type === 6) {
        // Bomb Brick: Neon purple (#A855F7) with pulsing core
        const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 8);
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(x, y, w, h);

        // Core glow
        ctx.fillStyle = pulse > 0.5 ? '#F3E8FF' : '#E9D5FF';
        const pw = Math.max(2, w * 0.4);
        const ph = Math.max(2, h * 0.4);
        ctx.fillRect(x + (w - pw) / 2, y + (h - ph) / 2, pw, ph);

        ctx.strokeStyle = '#7E22CE';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (b.type === 7 || b.type === 8) {
        // Keep the powerup readable even in the 15×11 dense brick grid.
        ctx.fillStyle = BRICK_TYPES[b.type].color;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#0C0F1D';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.type === 7 ? '×2' : '+3', x + w / 2, y + h / 2, w - 1);
      } else if (b.type === 9) {
        // Shield powerup: pale blue with a glowing floor bar glyph
        const pulse = 0.6 + 0.4 * Math.sin(this.animTime * 6);
        ctx.fillStyle = '#93C5FD';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.55 + 0.4 * pulse})`;
        ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
        ctx.fillRect(x + w / 2 - 1, y + 2, 2, h - 6);
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (theme && b.tint !== undefined && b.type <= 3) {
        // Generated maps: palette color per cell, darker for more armor
        ctx.fillStyle = this.themeColor(theme, b.tint, b.hp);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(x, y, w, Math.max(1, h * 0.28));
        if (b.hp >= 2) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        }
        if (b.hp >= 3) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2);
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (b.type === 3) {
        // Titanium: Crimson (#DC2626) multi-hit
        // Stage colors: 3 HP -> #DC2626, 2 HP -> #EA580C, 1 HP -> #FBBF24
        let color = '#DC2626';
        if (b.hp === 2) color = '#EA580C';
        if (b.hp === 1) color = '#FBBF24';

        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        // Damage bevel or crack indicator
        if (b.hp < b.maxHp) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 2);
          ctx.lineTo(x + w - 2, y + h - 2);
          ctx.stroke();
        }

        ctx.strokeStyle = '#991B1B';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (b.type === 2) {
        // Reinforced: Deep orange (#EA580C)
        const color = b.hp === 1 ? '#FBBF24' : '#EA580C';
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        if (b.hp === 1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y + 1);
          ctx.lineTo(x + w * 0.5, y + h - 1);
          ctx.stroke();
        }

        ctx.strokeStyle = '#C2410C';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else {
        // Regular Brick: Amber gold (#F59E0B)
        ctx.fillStyle = b.color || '#F59E0B';
        ctx.fillRect(x, y, w, h);

        // Top glossy highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x, y, w, Math.max(1, h * 0.3));

        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

    ctx.restore();
  }

  /**
   * Draws active particles.
   */
  drawParticles(ctx) {
    if (this.particles.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  pickupAppearance(type) {
    if (type === 7) return { label: '×2', color: '#84CC16' };
    if (type === 8) return { label: '+3', color: '#EC4899' };
    if (type === 9) return { label: 'S', color: '#7DD3FC' };
    return null;
  }

  /** Falling bonuses use center coordinates, matching their paddle hitboxes. */
  drawPickups(ctx, state) {
    if (!Array.isArray(state.pickups) || state.pickups.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Courier New", monospace';
    for (const pickup of state.pickups) {
      if (pickup.active === false || !Number.isFinite(pickup.x) || !Number.isFinite(pickup.y)) continue;
      const appearance = this.pickupAppearance(pickup.type);
      if (!appearance) continue;
      const width = pickup.width ?? this.config.pickups?.width ?? 24;
      const height = pickup.height ?? this.config.pickups?.height ?? 14;
      const left = pickup.x - width / 2;
      const top = pickup.y - height / 2;

      // Short upward streaks make the falling direction clear without
      // allocating a trail for every capsule spawned by a bomb cascade.
      ctx.fillStyle = appearance.color;
      for (let streak = 0; streak < 3; streak++) {
        ctx.globalAlpha = 0.35 - streak * 0.09;
        ctx.fillRect(pickup.x - 1, top - 5 - streak * 5, 2, 3);
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = appearance.color;
      ctx.shadowBlur = 9;
      ctx.fillStyle = appearance.color;
      drawRoundRect(ctx, left, top, width, height, height / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#0C0F1D';
      ctx.fillText(appearance.label, pickup.x, pickup.y + 0.5);
    }
    ctx.restore();
  }

  /**
   * Draws glowing balls and comet trails.
   */
  drawBalls(ctx, state) {
    const balls = state.balls;
    if (!Array.isArray(balls)) return;

    const activeIds = new Set(balls.filter(ball => ball.active).map(ball => ball.id));
    for (const ballId of this.ballTrails.keys()) {
      if (!activeIds.has(ballId)) this.ballTrails.delete(ballId);
    }

    ctx.save();
    const seeking = Boolean(state.seeker?.active);
    const trailColor = seeking ? '#F472B6' : '#F97316';
    const haloColor = seeking ? 'rgba(244, 114, 182, 0.45)' : 'rgba(249, 115, 22, 0.4)';
    const bodyColor = seeking ? '#F9A8D4' : '#FB923C';

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.active) continue;

      const ballId = ball.id ?? i;
      let trail = this.ballTrails.get(ballId);
      if (!trail) {
        trail = [];
        this.ballTrails.set(ballId, trail);
      }

      // Record position to trail if not attached to paddle
      if (!ball.attachedToPaddle) {
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > this.maxTrailLength) {
          trail.shift();
        }
      } else {
        trail.length = 0;
      }

      // 1. Draw comet tail
      for (let t = 0; t < trail.length; t++) {
        const pt = trail[t];
        const progress = (t + 1) / trail.length;
        const trailRadius = Math.max(1, ball.radius * progress * 0.75);
        ctx.globalAlpha = progress * 0.35;
        ctx.fillStyle = trailColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, trailRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Draw glowing ball core
      ctx.globalAlpha = 1.0;

      // Glow halo
      ctx.fillStyle = haloColor;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Main ball body: bright orange (pink while seeking)
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bright white-hot center spark
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ball.x - ball.radius * 0.25, ball.y - ball.radius * 0.25, ball.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draws the smooth glowing paddle with AI-assist indicator.
   */
  drawPaddle(ctx, state) {
    const paddle = state.paddle;
    if (!paddle) return;

    ctx.save();

    const isBot = Boolean(state.mode?.isBotActive);
    const x = paddle.x;
    const y = paddle.y;
    const w = paddle.width;
    const h = paddle.height;
    const radius = Math.min(6, h / 2);

    // Glow effect
    if (isBot) {
      // AI Mode: Electric Cyan pulsing glow (#06B6D4)
      const pulse = 0.7 + 0.3 * Math.sin(this.animTime * 10);
      ctx.shadowBlur = 12 * pulse;
      ctx.shadowColor = '#06B6D4';
      ctx.fillStyle = '#06B6D4';
    } else {
      // Manual Mode: Sky Blue glow (#38BDF8)
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#38BDF8';
      ctx.fillStyle = '#38BDF8';
    }

    // Paddle rounded body
    drawRoundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // Top highlight reflection
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    drawRoundRect(ctx, x + 2, y + 1, w - 4, h * 0.35, 2);
    ctx.fill();

    // AI Indicator Sensor Badge on Paddle
    if (isBot) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draws the top Heads-Up Display (Score, Lives, Level, Bot indicator).
   */
  drawHUD(ctx, state) {
    ctx.save();

    // HUD background strip
    ctx.fillStyle = 'rgba(12, 15, 29, 0.85)';
    ctx.fillRect(0, 0, this.width, 36);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.lineTo(this.width, 36);
    ctx.stroke();

    // Clear progress bar along the HUD edge
    const total = state.stats?.totalBreakableBricks || 0;
    if (total > 0) {
      const fraction = Math.min(1, (state.stats.bricksDestroyed || 0) / total);
      ctx.fillStyle = state.theme?.colors?.[1] || '#38BDF8';
      ctx.fillRect(0, 35, this.width * fraction, 3);
    }

    ctx.font = 'bold 12px "Courier New", monospace, sans-serif';
    ctx.textBaseline = 'middle';

    // 1. Score (Left)
    const scoreStr = String(state.score || 0).padStart(6, '0');
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('SCORE:', 10, 18);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(scoreStr, 58, 18);

    // 2. Level (Center)
    const levelNum = (state.levelIndex || 0) + 1;
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(state.map ? `MAP ${state.map.runIndex ?? levelNum}` : `LVL ${levelNum}`, 140, 18);

    // 3. Lives (Heart / Orb icons)
    const lives = Math.max(0, state.lives ?? 3);
    ctx.fillStyle = '#EF4444';
    let lifeX = 192;
    for (let l = 0; l < Math.min(5, lives); l++) {
      ctx.beginPath();
      ctx.arc(lifeX, 18, 4, 0, Math.PI * 2);
      ctx.fill();
      lifeX += 12;
    }

    // 4. Bot Mode Indicator (Right)
    const isBot = Boolean(state.mode?.isBotActive);
    const botText = isBot ? '● AI [B]' : '○ MANUAL [B]';
    ctx.fillStyle = isBot ? '#06B6D4' : '#64748B';
    const textWidth = ctx.measureText ? ctx.measureText(botText).width : 70;
    ctx.fillText(botText, this.width - textWidth - 10, 18);

    const activeBalls = state.balls?.filter(ball => ball.active).length ?? 0;
    ctx.fillStyle = '#EC4899';
    ctx.fillText(`BALLS ${activeBalls}`, 266, 18);

    // 5. Combo Indicator (if combo > 1)
    if (state.stats?.currentCombo > 1) {
      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`COMBO x${state.stats.currentCombo}`, 10, state.paddle.y - 35);
    }

    ctx.restore();
  }

  drawPowerupNotice(ctx, state) {
    if (!this.powerupNotice || state.status !== GAME_STATUS.PLAYING) return;
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(12, 15, 29, 0.9)';
    ctx.fillRect(70, state.paddle.y - 80, this.width - 140, 30);
    ctx.fillStyle = this.powerupNotice.color;
    ctx.fillText(this.powerupNotice.text, this.width / 2, state.paddle.y - 65);
    ctx.restore();
  }

  /**
   * Draws overlays for state machine statuses (READY, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY).
   */
  drawStateOverlay(ctx, state, width, height) {
    const status = state.status;
    if (status === GAME_STATUS.PLAYING) return;

    ctx.save();

    // Dark translucent backdrop (lighter on READY so the new map stays visible)
    ctx.fillStyle = status === GAME_STATUS.READY ? 'rgba(12, 15, 29, 0.5)' : 'rgba(12, 15, 29, 0.75)';
    ctx.fillRect(0, 36, width, height - 36);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = width / 2;
    const cy = height / 2;

    if (status === GAME_STATUS.READY) {
      // Ready Overlay
      ctx.font = 'bold 26px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(state.map ? 'RANDOM MAP' : 'BRICK BREAKER', cx, cy - 40);

      ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F8FAFC';
      const blink = Math.sin(this.animTime * 6) > 0;
      if (blink) {
        ctx.fillText('[ CLICK OR SPACE TO LAUNCH ]', cx, cy + 10);
      }

      ctx.font = '12px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('Press [B] for AI Autonomous Bot', cx, cy + 45);
      ctx.fillText('Mouse / Touch / Arrows to Steer', cx, cy + 68);
    } else if (status === GAME_STATUS.PAUSED) {
      // Paused Overlay
      ctx.font = 'bold 28px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('PAUSED', cx, cy - 20);

      ctx.font = 'bold 13px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText('[ PRESS P OR ESC TO RESUME ]', cx, cy + 20);
    } else if (status === GAME_STATUS.LEVEL_CLEAR) {
      // Level Clear Overlay
      ctx.font = 'bold 28px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#10B981';
      ctx.fillText('LEVEL CLEAR!', cx, cy - 25);

      ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(state.map ? 'Generating Next Map...' : 'Loading Next Corridor...', cx, cy + 15);
    } else if (status === GAME_STATUS.GAME_OVER) {
      // Game Over Overlay
      ctx.font = 'bold 30px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#EF4444';
      ctx.fillText('GAME OVER', cx, cy - 35);

      ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(`FINAL SCORE: ${state.score || 0}`, cx, cy + 5);

      ctx.font = '13px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('[ PRESS R TO RESTART ]', cx, cy + 40);
    } else if (status === GAME_STATUS.VICTORY) {
      // Victory Overlay
      ctx.font = 'bold 32px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText('VICTORY!', cx, cy - 45);

      ctx.font = 'bold 15px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#38BDF8';
      ctx.fillText('ALL LEVELS CLEARED!', cx, cy - 10);

      ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(`TOTAL SCORE: ${state.score || 0}`, cx, cy + 20);

      ctx.font = '13px "Courier New", monospace, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('[ PRESS R TO PLAY AGAIN ]', cx, cy + 55);
    }

    ctx.restore();
  }
}
