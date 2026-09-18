import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const host = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(require.resolve('@mrburdeveloperteam/pet-function/package.json'));
if (!existsSync(join(root, 'dist/pet.js'))) throw new Error('Install and build pet-function first.');
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
    }
  }
}
copyResources();
console.log('Pet resources prepared from:', root);
