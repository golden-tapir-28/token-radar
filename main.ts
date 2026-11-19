// token-radar: the entry point that turns the sealed snapshot into the board and the dashboard.
//
// The sealed snapshot is a DeFiLlama fetch of the protocol universe: 758 protocols, each with a
// TVL, a seven-day change, a listing date, and either a token on record or none. This program does
// not fetch anything and does not rank anything by hand. It hands the snapshot to the radar-2
// model in lib/model.ts, which scores every pre-token protocol the watchlist's own rule would
// keep, and it writes out the ranked board, the dashboard's dataset, the dashboard itself, the
// screenshots, and the dossier the judge reads.
//
// Run it with the snapshot in view. The grader mounts the sealed input at /input and writes to
// /output; a local run points at the kit's input and at a scratch directory instead:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The steps, in the order they happen:
//
//   1. Find the snapshot. --input names a file, or a directory that holds snapshot.json. The
//      default is /input, the grader's mount.
//   2. Parse it and score it. parseSnapshot refuses anything that is not the sealed shape, and
//      buildRadar returns the ranked board plus the dashboard's view of it. boardIssue refuses
//      a board the gate would refuse, so a bad model fails here instead of at the scorer.
//   3. Write board.json and data.js. board.json is the ranked rows; data.js is the same board
//      plus the live-token set and the category multiples, as one script the page reads.
//   4. Copy dashboard/ and screenshots/ from this repository into the output directory. The
//      gate needs at least three screenshots with plain names, so fewer than three, or a name
//      outside the plain-name rule, stops the run.
//   5. Write dossier.json last, from the finished output directory, with the vendored make.fun
//      library. The scorer rebuilds the dossier from the same files and compares the bytes, so
//      the dossier is written only once everything else is in place.
//
// The model, the farm plans and the dashboard's rendering all live elsewhere (lib/model.ts and
// dashboard/); this file is the wiring between the snapshot on disk and the output directory.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Where this repository lives on disk: the directory of this file, so dashboard/ and
// screenshots/ are found no matter which directory the program is invoked from.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The gate's caps, taken from the competition's reference/gate.json. The text cap shapes how
// much of the dashboard's source the dossier's text can carry; the screenshot and dashboard
// caps are hard refusals, so a directory past them writes no dossier at all.
const DOSSIER_TEXT_CAP = 65_536;
const SCREENSHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASHBOARD_LIMIT = { max_files: 400, max_bytes: 4_194_304 };

// A screenshot's name: a letter, digit or _ first, then letters, digits and . _ -, 1 to 128 of
// them, and no directory. The gate refuses anything else under /output.
const PLAIN_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// The gate's screenshot row needs three: the board, a detail view and a filtered view.
const MIN_SCREENSHOTS = 3;

/**
 * Read one `--flag value` or `--flag=value` argument from the command line, and fall back to
 * `fallback` when the flag is not there at all. The spaced form wins when both are given.
 */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const spacedAt = argv.indexOf(`--${flag}`);
  if (spacedAt >= 0 && spacedAt + 1 < argv.length) return argv[spacedAt + 1]!;
  const joined = argv.find((a) => a.startsWith(`--${flag}=`));
  if (joined === undefined) return fallback;
  return joined.slice(flag.length + 3);
}

/**
 * Stop the run with a message on stderr and an exit code. Every refusal in this file goes
 * through here, so the program never writes a half-finished output directory and calls it done.
 */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

// ------------------------------------------------------------------ inputs --

// The snapshot is a file, or a directory holding snapshot.json (the grader mounts /input).
const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}

// The output directory: --output, else MAKEFUN_OUTPUT_DIR for a local run, else /output.
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// ------------------------------------------------------------------- model --

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const boardProblem = boardIssue(board, snapshot);
if (boardProblem !== null) {
  fail(`the model wrote a board the gate refuses: ${boardProblem}`, 1);
}

// ----------------------------------------------------------------- outputs --

mkdirSync(outputDir, { recursive: true });

// board.json is the ranked rows, one JSON object with a rows array, and a trailing newline.
const boardText = JSON.stringify({ rows: board });
writeFileSync(join(outputDir, 'board.json'), `${boardText}\n`);

// data.js is the dashboard's whole dataset as one script: the board, the live-token set, the
// category multiples and the model, with no fetch and no network at render time.
const dashboardData = dataScript(radar);
writeFileSync(join(outputDir, 'data.js'), dashboardData);

/**
 * Copy every regular file of one directory into another, in the order the directory lists
 * them, and return the names that were copied. Names starting with a dot are skipped: the
 * gate refuses a dot-name anywhere under /output. A missing source directory copies nothing.
 */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyDirectory(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
const screenshots = copyDirectory(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
if (screenshots.length < MIN_SCREENSHOTS) {
  fail(
    `screenshots/ holds ${screenshots.length} image${screenshots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
    1,
  );
}
for (const name of screenshots) {
  if (!PLAIN_IMAGE_NAME.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  }
}

// The dossier is written last, from the finished output directory: the scorer rebuilds it from
// these same files and compares the bytes, so nothing may change after this line.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: SCREENSHOT_LIMIT,
    dashboard: DASHBOARD_LIMIT,
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside, ${radar.category_multiples.length} category multiples)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${screenshots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
