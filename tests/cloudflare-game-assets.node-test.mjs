import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { collectCloudflareChunkCounts, patchGodotLoader, splitCloudflareGameAssets, splitCloudflareGameWasm } from '../scripts/compress-cloudflare-games.mjs';

const originalLoader = `function loadFetch(file, tracker, fileSize, raw) {
  return fetch(file).then(function (response) { return response; });
}`;
const limits = { limit: 8, chunkSize: 5 };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'inventory-game-assets-'));
  t.after(() => {
    const target = resolve(root);
    const child = relative(resolve(tmpdir()), target);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child) && target.includes('inventory-game-assets-'));
    rmSync(target, { recursive: true, force: true });
  });
  function write(name, data) {
    const path = join(root, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, data);
    return path;
  }
  return { root, write };
}

function compiledDownload(source) {
  const start = source.indexOf('const chunkCounts = ');
  const end = source.indexOf('return responsePromise.then(function (response) {', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end).replace('/* pet-function-cloudflare-assets:end */', '');
  return new Function('file', 'location', 'fetch', body + 'return responsePromise;');
}

test('all oversized PCK/WASM assets split recursively; shared engines work; rerunning is byte-identical', t => {
  const { root, write } = fixture(t);
  const wasm = Buffer.from('abcdefghijk');
  const pck = Buffer.from('ABCDEFGHIJKLM');
  const wasmPath = write('mole-game/index.wasm', wasm);
  const pckPath = write('cat-kart/nested/index.pck', pck);
  const engineA = write('mole-game/index.js', originalLoader);
  const engineB = write('cat-kart/index.js', originalLoader);
  const tiny = write('other/index.wasm', 'small');
  const unrelated = write('other/large.bin', Buffer.alloc(20, 7));
  const ordinaryJs = write('other/entry.js', 'console.log("entry");');
  assert.equal(splitCloudflareGameWasm, splitCloudflareGameAssets);
  assert.equal(splitCloudflareGameAssets(root, limits), true);
  assert.equal(existsSync(wasmPath), false);
  assert.equal(existsSync(pckPath), false);
  assert.deepEqual(Buffer.concat([0, 1, 2].map(i => readFileSync(`${wasmPath}.part${i}`))), wasm);
  assert.deepEqual(Buffer.concat([0, 1, 2].map(i => readFileSync(`${pckPath}.part${i}`))), pck);
  const counts = collectCloudflareChunkCounts(root, limits);
  assert.deepEqual(counts['/games/mole-game/index.wasm'], { count: 3, size: 11, mime: 'application/wasm' });
  assert.deepEqual(counts['/games/cat-kart/nested/index.pck'], { count: 3, size: 13, mime: 'application/octet-stream' });
  assert.equal(readFileSync(engineA, 'utf8'), patchGodotLoader(originalLoader, counts));
  assert.equal(readFileSync(engineB, 'utf8'), readFileSync(engineA, 'utf8'));
  assert.equal(readFileSync(tiny, 'utf8'), 'small');
  assert.deepEqual(readFileSync(unrelated), Buffer.alloc(20, 7));
  assert.equal(readFileSync(ordinaryJs, 'utf8'), 'console.log("entry");');
  const before = readFileSync(engineA);
  assert.equal(splitCloudflareGameAssets(root, limits), false);
  assert.deepEqual(readFileSync(engineA), before);
  // A subsequent game must update every existing engine, then remain stable too.
  write('a-new-game/index.pck', Buffer.from('0123456789'));
  assert.equal(splitCloudflareGameAssets(root, limits), true);
  assert.match(readFileSync(engineA, 'utf8'), /a-new-game\/index\.pck/);
  assert.equal(splitCloudflareGameAssets(root, limits), false);
});

test('actual patched browser downloader retains query/hash, sets size/MIME, and leaves ordinary or external files alone', async t => {
  const { root, write } = fixture(t);
  write('cat-kart/index.pck', Buffer.from('ABCDEFGHIJKLM'));
  write('mole-game/index.wasm', Buffer.from('abcdefghijk'));
  const loaderPath = write('mole-game/index.js', originalLoader);
  splitCloudflareGameAssets(root, limits);
  const download = compiledDownload(readFileSync(loaderPath, 'utf8'));
  const location = { href: 'https://game.example/games/cat-kart/index.html', origin: 'https://game.example' };
  const requested = [];
  const fetch = async file => {
    requested.push(file);
    const url = new URL(file, location.href);
    return new Response(readFileSync(join(root, url.pathname.replace(/^\/games\//, ''))));
  };
  const pck = await download('index.pck?v=53#asset', location, fetch);
  assert.equal(await pck.text(), 'ABCDEFGHIJKLM');
  assert.equal(pck.headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(pck.headers.get('Content-Length'), '13');
  assert.deepEqual(requested, [0, 1, 2].map(i => `https://game.example/games/cat-kart/index.pck.part${i}?v=53#asset`));
  requested.length = 0;
  const wasm = await download('../mole-game/index.wasm?build=9', location, fetch);
  assert.equal(await wasm.text(), 'abcdefghijk');
  assert.equal(wasm.headers.get('Content-Type'), 'application/wasm');
  assert.equal(wasm.headers.get('Content-Length'), '11');
  const passthrough = [];
  const directFetch = async file => { passthrough.push(file); return new Response('ordinary'); };
  for (const file of ['other.pck?v=1', 'https://external.example/games/cat-kart/index.pck']) {
    assert.equal(await (await download(file, location, directFetch)).text(), 'ordinary');
  }
  assert.deepEqual(passthrough, ['other.pck?v=1', 'https://external.example/games/cat-kart/index.pck']);
});

test('chunk request errors and truncated content reject instead of booting corrupt games', async t => {
  const { root, write } = fixture(t);
  write('cat-kart/index.pck', Buffer.from('ABCDEFGHIJKLM'));
  const loaderPath = write('mole-game/index.js', originalLoader);
  splitCloudflareGameAssets(root, limits);
  const download = compiledDownload(readFileSync(loaderPath, 'utf8'));
  const location = { href: 'https://game.example/games/cat-kart/index.html' };
  await assert.rejects(download('index.pck', location, async () => new Response('', { status: 404 })), /Failed loading game asset chunk/);
  await assert.rejects(download('index.pck', location, async () => new Response('short')), /Incomplete game asset download/);
});

test('missing or unsupported Godot loaders fail before deleting or splitting source assets', t => {
  for (const loader of [null, 'function loadFetch(file) { return customFetch(file); }']) {
    const { root, write } = fixture(t);
    const source = write('cat-kart/index.pck', Buffer.from('ABCDEFGHIJKLM'));
    if (loader) write('mole-game/index.js', loader);
    assert.throws(() => splitCloudflareGameAssets(root, limits), /Godot/);
    assert.equal(readFileSync(source, 'utf8'), 'ABCDEFGHIJKLM');
    assert.equal(existsSync(source + '.part0'), false);
  }
});

test('existing mismatching or incomplete chunks do not delete source files', t => {
  const { root, write } = fixture(t);
  const source = write('cat-kart/index.pck', Buffer.from('ABCDEFGHIJKLM'));
  write('mole-game/index.js', originalLoader);
  write('cat-kart/index.pck.part0', 'WRONG');
  write('cat-kart/index.pck.part1', 'FGHIJ');
  write('cat-kart/index.pck.part2', 'KLM');
  assert.throws(() => splitCloudflareGameAssets(root, limits), /differs/);
  assert.equal(existsSync(source), true);
  assert.equal(readFileSync(source + '.part0', 'utf8'), 'WRONG');
  const other = fixture(t);
  other.write('cat-kart/index.pck.part1', 'FGHIJ');
  assert.throws(() => collectCloudflareChunkCounts(other.root, limits), /sequence/);
});
