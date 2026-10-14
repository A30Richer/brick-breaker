/**
 * Default Game Configuration & Constants
 * Brick Breaker Web Game
 * Pure ES Module - Zero external dependencies
 */

export const GAME_STATUS = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY'
});

export const BRICK_TYPES = Object.freeze({
  0: {
    id: 0,
    name: 'EMPTY',
    hp: 0,
    breakable: false,
    score: 0,
    color: 'transparent'
  },
  1: {
    id: 1,
    name: 'REGULAR',
    hp: 1,
    breakable: true,
    score: 100,
    color: '#F59E0B' // Amber gold
  },
  2: {
    id: 2,
    name: 'REINFORCED',
    hp: 2,
    breakable: true,
    score: 250,
    color: '#EA580C', // Deep orange
    crackColor: '#FBBF24'
  },
  3: {
    id: 3,
    name: 'TITANIUM',
    hp: 3,
    breakable: true,
    score: 500,
    color: '#DC2626', // Crimson
    stageColors: ['#FBBF24', '#EA580C', '#DC2626']
  },
  4: {
    id: 4,
    name: 'CORRIDOR_WALL',
    hp: Infinity,
    breakable: false,
    score: 0,
    color: '#334155', // Dark slate
    borderColor: '#94A3B8' // Silver border
  },
  5: {
    id: 5,
    name: 'BOOSTER',
    hp: 1,
    breakable: true,
    score: 300,
    color: '#06B6D4', // Electric cyan
    speedBoostFactor: 1.15
  },
  6: {
    id: 6,
    name: 'BOMB',
    hp: 1,
    breakable: true,
    score: 400,
    color: '#A855F7', // Neon purple
    blastRadius: 1 // 3x3 blast grid (1 tile in each direction)
  }
});

export const DEFAULT_CONFIG = Object.freeze({
  arena: {
    width: 480,
    height: 720
  },
  paddle: {
    width: 68,
    height: 12,
    y: 672,
    speed: 1000, // px/s
    maxSpeed: 1200
  },
  ball: {
    radius: 4.5,
    speed: 450, // px/s
    maxSpeed: 750,
    minSpeed: 400,
    speedIncrementOnHit: 1.5 // px/s added on brick hit
  },
  physics: {
    subSteps: 8,
    maxSubSteps: 16,
    minVerticalSpeedRatio: 0.25, // |vy| >= 0.25 * |v|
    maxDeflectionAngle: (60 * Math.PI) / 180, // 60 degrees in radians
    paddleMomentumTransfer: 0.2, // Transfer 20% paddle velocity to ball vx
    antiStallThreshold: 0.25,
    microJitter: 0.05
  },
  grid: {
    cols: 32,
    rows: 44,
    brickWidth: 15.0,
    brickHeight: 11.0,
    offsetX: 0,
    offsetY: 40
  },
  rules: {
    initialLives: 3,
    maxLives: 5
  },
  theme: {
    background: '#0c0f1d',
    border: '#1e293b',
    paddle: '#38bdf8',
    paddleBot: '#06b6d4',
    ball: '#f97316',
    hudText: '#f8fafc',
    accent: '#38bdf8'
  }
});
