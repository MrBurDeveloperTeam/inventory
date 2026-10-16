import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { collectCloudflareChunkCounts, patchGodotLoader } from './compress-cloudflare-games.mjs';
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
const declared = JSON.parse(readFileSync(join(host, 'package.json'))).dependencies['@mrburdeveloperteam/pet-function'];
assert.equal(manifest.version, declared.split('#v').at(-1));
const resources = JSON.parse(readFileSync(join(root, 'resource-manifest.json'), 'utf8'));
assert.equal(resources.version, manifest.version);
assert.ok(!existsSync(join(host, 'public/games')), 'Host must not retain executable game copies.');
const syncResources = join(root, 'scripts/sync-resource-packs.mjs');
const packagePublic = existsSync(syncResources)
  ? await (await import(pathToFileURL(syncResources).href)).ensurePublicResources(root)
  : join(root, 'public');
const canonical = join(packagePublic, 'games');
const output = join(host, 'dist/games');
assert.ok(existsSync(output), 'Build Inventory before verifying game resources.');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const files = walk(canonical);
const expected = new Set();
const chunkCounts = {};
for (const file of files) {
  const relativePath = relative(canonical, file).split('\\').join('/');
  const builtPath = join(output, relativePath);
  if (/\.(wasm|pck)$/.test(file) && !existsSync(builtPath)) {
    const parts = [];
    for (let index = 0; existsSync(`${builtPath}.part${index}`); index++) {
      parts.push(readFileSync(`${builtPath}.part${index}`));
      expected.add(`${relativePath}.part${index}`);
    }
    assert.ok(parts.length, `Missing game chunks: ${relativePath}`);
    assert.ok(Buffer.concat(parts).equals(readFileSync(file)), `Game chunk content differs: ${relativePath}`);
    chunkCounts[`/games/${relativePath}`] = {
      count: parts.length, size: statSync(file).size,
      mime: file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
    };
  } else expected.add(relativePath);
}
const loaderCounts = collectCloudflareChunkCounts(output);
assert.deepEqual(loaderCounts, chunkCounts);
for (const file of files) {
  const relativePath = relative(canonical, file).split('\\').join('/');
  const builtPath = join(output, relativePath);
  if (!expected.has(relativePath)) continue; // Reconstructed and checked above.
  if (file.endsWith('.js') && Object.keys(chunkCounts).length) {
    const original = readFileSync(file, 'utf8');
    assert.equal(readFileSync(builtPath, 'utf8'), patchGodotLoader(original, loaderCounts), `Unexpected loader changes: ${relativePath}`);
    continue;
  }
  assert.ok(readFileSync(builtPath).equals(readFileSync(file)), `Game resource differs: ${relativePath}`);
}
assert.deepEqual(new Set(walk(output).map(file => relative(output, file).split('\\').join('/'))), expected);
for (const file of walk(join(host, 'dist'))) {
  assert.ok(statSync(file).size <= 25 * 1024 * 1024, `Cloudflare asset exceeds 25 MiB: ${file}`);
}
const gameCount = readdirSync(canonical, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
console.log(`Verified pet-function ${manifest.version}: ${files.length} game files across ${gameCount} games; WASM/PCK reconstruction and 25 MiB asset limits passed.`);
