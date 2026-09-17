# Shared cat integration

Inventory imports `@mrburdeveloperteam/pet-function` from the GitHub tag `v0.9.10`.
The package is maintained in the separate `intern/pet-function` repository, not mrbur or molar-experience.

Shared: cat rendering, pet UI and care/game runtime, AI chat UI, pet options, images, and all four games.
`games/MeowdokuLauncher.tsx` only connects Inventory's account and repository to the shared launcher.

Inventory-owned: `components/CatMascot.jsx` dialogue and inventory queries,
`aiExperience/inventoryMolarAdapter.ts` business/data orchestration,
`petExperience/inventoryPetRepository.ts` persistence, and the existing account, location and currency wiring.
No database schema or online records were changed for this migration.

`scripts/prepare-pet.mjs` prepares non-game images before dev/build.
The shared Vite plugin serves games directly from the installed package during development,
and emits identical package games into `dist/games` for deployment.
There are no executable game copies under `public/games`.
The historical URL directory `molar-experience` is only an image path; it does not identify an old package dependency.

Verify locally:

```
npm run build
node node_modules/typescript/bin/tsc -p tsconfig.pet-check.json --noEmit
node scripts/verify-pet.mjs
```

Authenticated manual checks remain necessary: inventory-aware dialogue, care/shop wallet persistence,
four games and rewards, Meowdoku progress/check-in, sign-out and account switching.

Updating shared source does not automatically update a deployed application: publish a new package/tag,
update this repository's dependency and lockfile, then rebuild/redeploy Inventory.
This integration adds no paid service or paid import operation.
