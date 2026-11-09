// Glint build: src → dist (index.html, app.js, glint.css, config.xml, icon.png) → build/glint.wgt
//
//   npm run build            dist/, minified
//   npm run dev              dist/, not minified, with source maps (open dist/index.html in Chrome)
//   npm run wgt              + build/glint.wgt (unsigned; apps2samsung-cli signs it on install)
//   GLINT_TV=<tv ip> npm run tv   + sign, install and launch on the TV with apps2samsung-cli
//   GLINT_SELFTEST=<url> …        builds in the self-test (src/selftest.js): drives the remote and POSTs frame times
//
// The target is chrome56: Samsung TVs of 2018 (Tizen 4.0) run Chromium M56. esbuild lowers newer syntax
// (object spread, optional chaining, …) and refuses what it cannot lower — that is the point.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

function preset() {
  const v = process.env.GLINT_PRESET;
  if (!v) return '';
  const text = existsSync(v) ? readFileSync(v, 'utf8') : v;
  JSON.parse(text);   // fail the build on a broken preset, not the TV
  return text;
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome56'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  outfile: 'dist/app.js',
  // GLINT_SELFTEST=<report url> builds in src/selftest.js (drives the remote, POSTs frame times there)
  // GLINT_PRESET=<file.json | json> — extensions and their settings applied on the first start (local builds only)
  define: {
    GLINT_VERSION: JSON.stringify(pkg.version),
    GLINT_SELFTEST: JSON.stringify(process.env.GLINT_SELFTEST || ''),
    GLINT_PRESET: JSON.stringify(preset()),
  },
  logLevel: 'info',
});

copyFileSync('src/index.html', 'dist/index.html');
copyFileSync('src/styles.css', 'dist/glint.css');
copyFileSync('widget/icon.png', 'dist/icon.png');
writeFileSync('dist/config.xml', readFileSync('widget/config.xml', 'utf8').replace('{{version}}', pkg.version));

if (args.has('--wgt')) {
  mkdirSync('build', { recursive: true });
  rmSync('build/glint.wgt', { force: true });
  execFileSync('zip', ['-q', '-r', '-X', '../build/glint.wgt', '.'], { cwd: 'dist', stdio: 'inherit' });
  console.log('build/glint.wgt');
}

if (args.has('--install')) {
  const tv = process.env.GLINT_TV;
  if (!tv) { console.error('GLINT_TV=<TV ip> is required'); process.exit(2); }
  if (!existsSync('build/glint.wgt')) { console.error('build/glint.wgt is missing'); process.exit(1); }
  // --json -q and no stdin: run from a script, the CLI must never sit waiting for an answer in the terminal
  // (2026-11-09: without them `npm run tv` hung for 5 minutes with no output).
  execFileSync('apps2samsung-cli', ['install', 'build/glint.wgt', '--tv', tv, '--launch', '--json', '-q'],
    { stdio: ['ignore', 'inherit', 'inherit'], timeout: 180000 });
}
