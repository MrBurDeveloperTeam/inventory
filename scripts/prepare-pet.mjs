import { createRequire } from 'node:module';
import { readFileSync as readResource } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
if (!existsSync(join(root, 'public'))) throw new Error('Installed pet-function package has no public resources: ' + root);
rmSync(join(host, 'public', 'molar-experience'), { recursive: true, force: true });
rmSync(join(host, 'public', 'images', 'cat-meow.mp3'), { force: true });
function copyResources(relative = '') {
  for (const entry of readdirSync(join(root, 'public', relative), { withFileTypes: true })) {
    const name = join(relative, entry.name);
    const parts = name.split(/[\\/]/);
    if (parts[0] === 'games' || parts[0] === 'pets') continue;
    if (parts[0] === 'images' && parts.at(-1) !== 'cat-meow.mp3') continue;
    if (entry.isDirectory()) copyResources(name);
    else {
      const target = join(host, 'public', name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, 'public', name), target);
      if (!readResource(join(root, 'public', name)).equals(readResource(target))) throw new Error('Shared resource copy mismatch: ' + target);
    }
  }
}
copyResources();
for (const required of ['pet-function/pet/grey_bed.png', 'pet-function/pet/red_bed.png', 'pet-function/pet/purple_bed.png', 'pet-function/pets/mallow-spritesheet.webp']) {
  if (!existsSync(join(host, 'public', required))) throw new Error('Missing prepared pet-function resource: public/' + required);
}
console.log('Pet resources prepared from:', root);
