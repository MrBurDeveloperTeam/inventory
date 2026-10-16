import { createRequire } from 'node:module';
import { readFileSync as readResource } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
const syncResources = join(root, 'scripts/sync-resource-packs.mjs');
const packagePublic = existsSync(syncResources)
  ? await (await import(pathToFileURL(syncResources).href)).ensurePublicResources(root)
  : join(root, 'public');
if (!existsSync(packagePublic)) throw new Error('Installed pet-function package has no public resources: ' + root);
rmSync(join(host, 'public', 'molar-experience'), { recursive: true, force: true });
rmSync(join(host, 'public', 'images', 'cat-meow.mp3'), { force: true });
function copyResources(relative = '') {
  for (const entry of readdirSync(join(packagePublic, relative), { withFileTypes: true })) {
    const name = join(relative, entry.name);
    const parts = name.split(/[\\/]/);
    if (parts[0] === 'games' || parts[0] === 'pets') continue;
    if (parts[0] === 'images' && parts.at(-1) !== 'cat-meow.mp3') continue;
    if (entry.isDirectory()) copyResources(name);
    else {
      const target = join(host, 'public', name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(packagePublic, name), target);
      if (!readResource(join(packagePublic, name)).equals(readResource(target))) throw new Error('Shared resource copy mismatch: ' + target);
    }
  }
}
copyResources();
for (const required of ['pet-function/pet/grey_bed.png', 'pet-function/pet/red_bed.png', 'pet-function/pet/purple_bed.png', 'pet-function/pets/mallow-spritesheet.webp']) {
  if (!existsSync(join(host, 'public', required))) throw new Error('Missing prepared pet-function resource: public/' + required);
}
console.log('Pet resources prepared from:', root);
