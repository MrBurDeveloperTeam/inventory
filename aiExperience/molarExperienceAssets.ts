// INVENTORY-4 (Shared 0.6.7 presentation recovery): canonical host asset
// mapping for @mrburdeveloperteam/molar-experience's Molar/Cat/Pet
// presentation.
//
// ROOT CAUSE this file fixes: Shared's own compiled bundles (dist/cat.js,
// dist/pet.js, dist/ai.js) embed their default asset URLs as plain
// RELATIVE PATH STRING LITERALS baked in at Shared's own build time (e.g.
// `var mallow_spritesheet_default = "./mallow-spritesheet-ZVV4Q574.webp";`),
// never as a Vite-visible `import`. Those strings are only ever consumed
// via runtime string interpolation into an inline style
// (`--pet-spritesheet: url("...")`) or an `<img src="...">` — neither is
// something Vite's static asset pipeline can discover, so Inventory's own
// production build never copies those files, and the relative path resolves
// (per the CSS/HTML spec, against the current page's URL, not the npm
// package's location) to a 404 on every deploy. Confirmed directly: no
// hashed Shared default asset (e.g. `mallow-spritesheet-ZVV4Q574.webp`)
// exists anywhere in Inventory's own `dist/` output. The fix is exactly
// what Shared's own `spriteSheetUrls`/`assetUrls`/`logoUrl` props exist for
// — pass this host's OWN already-bundled-by-Vite `public/` asset URLs
// instead of relying on the package defaults.
//
// Source of truth: `public/pets/` (purpose-built for Pet/Cat assets — it
// already contains the beds and bathroom-care images too, unlike
// `public/images/`, which is a mixed-purpose folder). Molar's logo only
// exists under `public/images/`. Every path below was confirmed to
// physically exist with this exact casing before being added.

import type { SharedCatPetId } from '@mrburdeveloperteam/molar-experience/cat';

// INVENTORY-4D: `/images/MolarAI.png` was proven to be the wrong asset —
// despite its filename, it's a cat-mascot graphic (glasses/mustache/bow
// tie), not a Molar AI logo. `/icons/ai_logo.png` is the correct one: it
// already exists in this host's own public assets, matches the same
// established canonical choice App Gallery's own molarExperienceAssets.ts
// uses (`MOLAR_LOGO_URL = '/icons/ai_logo.png'`), and is visually
// consistent with Shared's own bundled default "AI" wordmark.
export const MOLAR_LOGO_URL = '/icons/ai_logo.png';

export const CAT_SPRITE_SHEET_URLS: Partial<Record<SharedCatPetId, string>> = {
  mallow: '/pets/mallow-spritesheet.webp',
  silverbelt: '/pets/silverbelt-spritesheet.webp',
  fastrat: '/pets/fastrat-spritesheet.webp',
  gulu: '/pets/gulu-spritesheet.webp',
  munchkin: '/pets/munchkinspritesheet.webp',
  mochi: '/pets/mochi-spritesheet.webp',
};

export const PET_ASSET_URLS = {
  spriteSheets: CAT_SPRITE_SHEET_URLS,
  beds: {
    grey: '/pets/grey_bed.png',
    red: '/pets/red_bed.png',
    purple: '/pets/purple_bed.png',
  },
  care: {
    poop: '/pets/poop.png',
    shower: '/pets/shower.png',
    soap: '/pets/soap.png',
  },
};
