// Token Launch Radar — entry point.
//
// What this program does, end to end:
//   1. Loads the sealed snapshot (a JSON file, or a directory holding snapshot.json).
//   2. Scores every protocol in it with the radar model from lib/model.ts.
//   3. Refuses to continue if the resulting board fails the gate's own checks.
//   4. Writes board.json and data.js, copies dashboard/ and screenshots/ into the
//      output directory, and finally writes dossier.json for the judge.
//   5. Prints a short summary of what it wrote.
//
// It runs on Node 22+ with nothing but the standard library. The snapshot defaults
// to the sealed /input mount and the output to /output; outside the grader's
// container, point MAKEFUN_OUTPUT_DIR at a scratch directory instead, e.g.:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// The folder this file lives in, so dashboard/ and screenshots/ are found next to it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Limits the scorer holds us to (see the gate): the dossier text is capped and the
// rest only ever refuse, so these numbers are passed straight through to buildDossier.
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASHBOARD_LIMIT = { max_files: 400, max_bytes: 4_194_304 };

// A screenshot name the dossier accepts: starts with a letter, digit or underscore,
// then letters, digits, dots, underscores or dashes, at most 128 characters in all.
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// How few screenshots the entry may hand in: the board itself, a detail view and a
// filtered view.
const MIN_SHOTS = 3;

/** Print a message to stderr and stop with the given exit code. */
function die(message: string, code: number): never {
  process.stderr.write(`radar: ${message}\n`);
  process.exit(code);
}

/**
 * The value of a `--flag value` or `--flag=value` argument, or `fallback` when the
 * flag is absent. A `--flag` with nothing after it also falls back.
 */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const plain = argv.indexOf(`--${flag}`);
  if (plain >= 0 && plain + 1 < argv.length) return argv[plain + 1]!;
  const glued = argv.find((a) => a.startsWith(`--${flag}=`));
  return glued === undefined ? fallback : glued.slice(flag.length + 3);
}

/** Where the snapshot lives: a JSON file directly, or snapshot.json inside a directory. */
function snapshotPath(): string {
  const given = flagValue('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

/** Where the outputs go: --output, else MAKEFUN_OUTPUT_DIR, else /output. */
function outputDir(): string {
  return flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

/** Read and parse the snapshot, dying with a clear message when it is missing. */
function loadSnapshot(path: string) {
  if (!existsSync(path)) {
    die(
      `no snapshot found at ${path} — pass --input <snapshot.json|directory> or mount the sealed /input`,
      2,
    );
  }
  return parseSnapshot(readFileSync(path, 'utf8'));
}

/**
 * Copy every regular file of one directory into another, skipping dotfiles, and
 * return the names copied. A missing source directory copies nothing.
 */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    names.push(name);
  }
  return names;
}

/** Check the copied screenshots are enough of them and all acceptably named. */
function checkShots(shots: string[]): void {
  if (shots.length < MIN_SHOTS) {
    die(
      `screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'} — hand in ${MIN_SHOTS}: the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) {
      die(
        `screenshots/${name} is not a valid name — letters, digits and . _ -, 1 to 128 characters`,
        1,
      );
    }
  }
}

/** The whole run: load, score, gate, write, copy, dossier, summary. */
function run(): void {
  const input = snapshotPath();
  const out = outputDir();

  const snapshot = loadSnapshot(input);
  const { board, radar } = buildRadar(snapshot);

  const problem = boardIssue(board, snapshot);
  if (problem !== null) die(`the model produced a board the gate rejects: ${problem}`, 1);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const dashFiles = copyDirectory(join(repoRoot, 'dashboard'), join(out, 'dashboard'));
  const shots = copyDirectory(join(repoRoot, 'screenshots'), join(out, 'screenshots'));
  checkShots(shots);

  // The dossier goes last: the scorer rebuilds it from this output directory and
  // compares it byte for byte, so nothing may change after this write.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: DOSSIER_TEXT_CAP,
      screenshots: SHOT_LIMIT,
      dashboard: DASHBOARD_LIMIT,
    }),
  );

  process.stdout.write(
    `radar: scored ${board.length} rows from ${snapshot.protocols.length} protocols (${snapshot.watchlist.length} on the watchlist; ${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

run();
