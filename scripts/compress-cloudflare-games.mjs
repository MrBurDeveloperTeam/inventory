import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 25 * 1024 * 1024;
const CHUNK_SIZE = 20 * 1024 * 1024;
const FETCH_STATEMENT = 'return fetch(file).then(function (response) {';
const PATCH_START = '/* pet-function-cloudflare-assets:start */';
const PATCH_END = '/* pet-function-cloudflare-assets:end */';

function filesUnder(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
}

function assetUrl(root, path) {
  return '/games/' + relative(root, path).split(sep).join('/');
}

function validateLimits(limit, chunkSize = limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > limit) {
    throw new Error('Game asset chunk size must be a positive integer within the asset limit.');
  }
}

// Infer metadata from output files so repeated postbuild runs need no separate manifest.
export function collectCloudflareChunkCounts(gamesRoot, { limit = LIMIT } = {}) {
  validateLimits(limit);
  const groups = new Map();
  for (const path of filesUnder(gamesRoot)) {
    const match = /^(.*\.(wasm|pck))\.part(\d+)$/i.exec(path);
    if (!match) continue;
    const parts = groups.get(match[1]) || [];
    parts.push({ index: Number(match[3]), path });
    groups.set(match[1], parts);
  }
  const counts = {};
  for (const [assetPath, parts] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    parts.sort((a, b) => a.index - b.index);
    let size = 0;
    for (let i = 0; i < parts.length; i += 1) {
      const bytes = statSync(parts[i].path).size;
      if (parts[i].index !== i || bytes < 1 || bytes > limit) throw new Error('Invalid game asset chunk sequence: ' + assetPath);
      size += bytes;
    }
    counts[assetUrl(gamesRoot, assetPath)] = {
      count: parts.length,
      size,
      mime: assetPath.toLowerCase().endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
    };
  }
  return counts;
}

export function chunkLoaderSource(chunkCounts) {
  const sortedCounts = Object.fromEntries(Object.entries(chunkCounts).sort(([a], [b]) => a.localeCompare(b)));
  return `${PATCH_START}
        const chunkCounts = ${JSON.stringify(sortedCounts)};
        const assetUrl = new URL(file, location.href);
        const asset = assetUrl.origin === new URL(location.href).origin ? chunkCounts[assetUrl.pathname] : null;
        const responsePromise = asset
            ? Promise.all(Array.from({ length: asset.count }, function (_, part) {
                const chunkUrl = new URL(assetUrl.href);
                chunkUrl.pathname += '.part' + part;
                return fetch(chunkUrl.href);
            })).then(async function (responses) {
                for (const response of responses) {
                    if (!response.ok) throw new Error(\`Failed loading game asset chunk '\${response.url}'\`);
                }
                const chunks = await Promise.all(responses.map(function (response) { return response.arrayBuffer(); }));
                const size = chunks.reduce(function (total, chunk) { return total + chunk.byteLength; }, 0);
                if (size !== asset.size) throw new Error('Incomplete game asset download: ' + file);
                return new Response(new Blob(chunks, { type: asset.mime }), {
                    headers: { 'Content-Type': asset.mime, 'Content-Length': String(size) },
                });
            })
            : fetch(file);
        ${PATCH_END}
        return responsePromise.then(function (response) {`;
}

// Every Godot loader needs the same map: cat-kart also boots through the mole-game engine.
export function patchGodotLoader(source, chunkCounts) {
  const start = source.indexOf(PATCH_START);
  if (start >= 0) {
    const end = source.indexOf(PATCH_END, start);
    const suffix = 'return responsePromise.then(function (response) {';
    const suffixStart = source.indexOf(suffix, end);
    if (end < 0 || suffixStart < 0 || source.slice(end + PATCH_END.length, suffixStart).trim()) {
      throw new Error('Unable to update existing Godot chunk loader.');
    }
    return source.slice(0, start) + chunkLoaderSource(chunkCounts) + source.slice(suffixStart + suffix.length);
  }
  if (!/function\s+loadFetch\s*\(/.test(source)) return source;
  if (!source.includes(FETCH_STATEMENT)) throw new Error('Unable to patch Godot fetch loader.');
  return source.replace(FETCH_STATEMENT, chunkLoaderSource(chunkCounts));
}

export function splitCloudflareGameAssets(gamesRoot, { limit = LIMIT, chunkSize = CHUNK_SIZE } = {}) {
  validateLimits(limit, chunkSize);
  const root = resolve(gamesRoot);
  const files = filesUnder(root);
  const oversized = files.filter(path => /\.(wasm|pck)$/i.test(path) && statSync(path).size > limit);
  const previousCounts = collectCloudflareChunkCounts(root, { limit });
  const nextCounts = { ...previousCounts };
  const plans = oversized.map(path => {
    const bytes = readFileSync(path);
    const count = Math.ceil(bytes.length / chunkSize);
    const existing = previousCounts[assetUrl(root, path)];
    if (existing && existing.count !== count) throw new Error('Existing game chunks conflict with source: ' + path);
    nextCounts[assetUrl(root, path)] = {
      count,
      size: bytes.length,
      mime: path.toLowerCase().endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
    };
    return { path, bytes, count };
  });
  if (!Object.keys(nextCounts).length) return false;

  // Validate all engines before creating chunks or removing any source file.
  const loaders = files.filter(path => path.endsWith('.js')).map(path => {
    const source = readFileSync(path, 'utf8');
    try {
      return { path, source, patched: patchGodotLoader(source, nextCounts) };
    } catch (error) {
      throw new Error(`${error.message} File: ${path}`);
    }
  });
  if (!loaders.some(loader => loader.patched.includes(PATCH_START))) throw new Error('No compatible Godot loader found for split game assets.');

  for (const plan of plans) {
    for (let part = 0; part < plan.count; part += 1) {
      const path = `${plan.path}.part${part}`;
      const expected = plan.bytes.subarray(part * chunkSize, (part + 1) * chunkSize);
      if (existsSync(path) && !readFileSync(path).equals(expected)) throw new Error('Existing game chunk differs from source: ' + path);
      writeFileSync(path, expected);
    }
  }
  // Verify the actual written bytes and engines before deleting originals.
  for (const plan of plans) {
    const restored = Buffer.concat(Array.from({ length: plan.count }, (_, part) => readFileSync(`${plan.path}.part${part}`)));
    if (!restored.equals(plan.bytes)) throw new Error('Game asset split failed its integrity check: ' + plan.path);
  }
  let changed = plans.length > 0;
  for (const loader of loaders) {
    if (loader.patched !== loader.source) {
      writeFileSync(loader.path, loader.patched);
      if (readFileSync(loader.path, 'utf8') !== loader.patched) throw new Error('Godot chunk loader write failed: ' + loader.path);
      changed = true;
    }
  }
  for (const plan of plans) rmSync(plan.path);
  return changed;
}

// Keep the previous public helper available to downstream checks.
export const splitCloudflareGameWasm = splitCloudflareGameAssets;

const directRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const gamesRoot = resolve(host, process.argv[2] || 'dist/games');
  console.log(splitCloudflareGameAssets(gamesRoot) ? 'Prepared Cloudflare-safe Godot WASM and PCK chunks.' : 'Game asset chunks are already prepared.');
}
