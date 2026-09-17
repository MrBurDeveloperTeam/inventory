import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
assert.equal(manifest.version, '0.9.10');
assert.ok(!existsSync(join(host, 'public/games')), 'Host must not retain executable game copies.');
const canonical = join(root, 'public/games');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const files = walk(canonical);
for (const file of files) {
  assert.deepEqual(readFileSync(join(host, 'dist/games', relative(canonical, file))), readFileSync(file));
}
assert.equal(walk(join(host, 'dist/games')).length, files.length);
for (const game of ['flappy-cat', 'pac-cat', 'tetris', 'meowdoku']) {
  assert.ok(existsSync(join(host, 'dist/games', game, 'index.html')));
}
console.log(`Verified pet-function ${manifest.version}: ${files.length} game files match exactly across four games.`);
