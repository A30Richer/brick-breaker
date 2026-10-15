#!/usr/bin/env node
/**
 * Map lab CLI: generate unique procedural maps, preview them, and let the
 * bot vet them headlessly. Intended as the first stage of an automated
 * "generate -> autoplay -> record" pipeline.
 *
 * Examples:
 *   node tools/mapgen.js --count 8 --sheet out/maps/sheet.png
 *   node tools/mapgen.js --count 5 --difficulty chill --simulate --max-seconds 90 --require-clear --out out/maps
 *   node tools/mapgen.js --count 10 --history out/maps/history.json   # never repeat across runs
 *
 * Options:
 *   --count N          maps to output (default 6)
 *   --seed TEXT        run seed (default: random code); same seed -> same maps
 *   --difficulty D     chill | normal | hard (default normal)
 *   --out DIR          write <name>.json level definitions (+ .png with --png)
 *   --png              also write one PNG thumbnail per map (needs --out)
 *   --sheet FILE       write a contact sheet PNG of all output maps
 *   --simulate         let the bot play each map headlessly and report
 *   --max-seconds S    simulation budget per map (default 180)
 *   --require-clear    keep only maps the bot clears within the budget
 *   --history FILE     JSON list of used fingerprints; skipped and appended
 *   --ascii            print each layout as text
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MapSequence } from '../src/core/map_generator.js';
import { makeSeedCode } from '../src/core/rng.js';
import { simulateLevel } from '../src/core/autoplay.js';
import { renderMapPreview, renderContactSheet, encodePng } from './map_preview.js';

function parseArgs(argv) {
  const args = { count: 6, difficulty: 'normal', maxSeconds: 180 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--count') args.count = Number(value());
    else if (flag === '--seed') args.seed = value();
    else if (flag === '--difficulty') args.difficulty = value();
    else if (flag === '--out') args.out = value();
    else if (flag === '--png') args.png = true;
    else if (flag === '--sheet') args.sheet = value();
    else if (flag === '--simulate') args.simulate = true;
    else if (flag === '--max-seconds') args.maxSeconds = Number(value());
    else if (flag === '--require-clear') args.requireClear = args.simulate = true;
    else if (flag === '--history') args.history = value();
    else if (flag === '--ascii') args.ascii = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return args;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function writeFile(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').filter(line => line.startsWith(' *')).join('\n'));
    return;
  }
  const history = args.history && existsSync(args.history) ? JSON.parse(readFileSync(args.history, 'utf8')) : [];
  const seed = args.seed ?? makeSeedCode();
  const sequence = new MapSequence({ seed, difficulty: args.difficulty, avoid: history.map(item => item.fingerprint) });
  const accepted = [];
  const rows = [];
  const maxTries = args.requireClear ? args.count * 12 : args.count;

  for (let tries = 0; tries < maxTries && accepted.length < args.count; tries++) {
    const def = sequence.next();
    const row = {
      seed: def.seed,
      name: def.name,
      recipe: `${def.recipe.motif}${def.recipe.layer ? '/' + def.recipe.layer : ''} · ${def.recipe.symmetry} · ${def.recipe.structures.join('+') || '-'}`,
      bricks: def.stats.breakables,
      walls: def.stats.walls,
      fingerprint: def.fingerprint,
    };
    if (args.simulate) {
      const run = simulateLevel(def, { maxSeconds: args.maxSeconds });
      Object.assign(row, {
        cleared: run.cleared,
        seconds: run.seconds,
        percent: run.percent,
        maxBalls: run.maxBalls,
        chain: run.longestChain,
      });
      def.autoplay = run;
      if (args.requireClear && !run.cleared) {
        rows.push({ ...row, kept: false });
        continue;
      }
    }
    rows.push({ ...row, kept: true });
    accepted.push(def);
    if (args.ascii) {
      console.log(`\n${def.name} (${def.seed})`);
      console.log(def.layout.map(line => line.replace(/0/g, '·').replace(/4/g, '█')).join('\n'));
    }
  }

  console.log(`Run seed ${seed} · ${args.difficulty} · ${accepted.length}/${args.count} maps`);
  console.table(rows);

  if (args.out) {
    for (const def of accepted) {
      const base = join(args.out, `${slug(def.seed)}-${slug(def.name)}`);
      writeFile(`${base}.json`, JSON.stringify(def, null, 2));
      if (args.png) writeFile(`${base}.png`, encodePng(renderMapPreview(def)));
    }
    console.log(`Wrote ${accepted.length} map definitions to ${args.out}`);
  }
  if (args.sheet && accepted.length) {
    writeFile(args.sheet, encodePng(renderContactSheet(accepted)));
    console.log(`Wrote contact sheet ${args.sheet}`);
  }
  if (args.history) {
    const now = new Date().toISOString();
    history.push(...accepted.map(def => ({ fingerprint: def.fingerprint, seed: def.seed, name: def.name, at: now })));
    writeFile(args.history, JSON.stringify(history, null, 2));
    console.log(`History now holds ${history.length} maps (${args.history})`);
  }
  if (args.requireClear && accepted.length < args.count) process.exitCode = 1;
}

main();
