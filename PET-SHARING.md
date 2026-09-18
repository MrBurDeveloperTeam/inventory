# Shared cat integration

Inventory's manifest now targets `github:mrburdeveloperteam/pet-function#v0.9.11`.
The remote tag exists and resolves to cc17938a37e5b2597dd05a70a96e52887d186550.
The lockfile and installed node_modules now use that GitHub commit, not a sibling-folder
link. Inventory's production build, type check and all 82 game-file comparisons passed
using the installed GitHub dependency. Real authenticated acceptance checks remain necessary.
The package is maintained in the separate `intern/pet-function` repository, not mrbur or molar-experience.

Shared: cat rendering, pet UI and care/game runtime, AI chat UI, pet options, images, and all four games.
`games/MeowdokuLauncher.tsx` only connects Inventory's account and repository to the shared launcher.

New shared Inventory implementation: `pet-function/src/apps/inventory/` contains
reminder candidates, grounded data providers, semantic routing, follow-up context,
confirmed-action proposal parsing, Molar adapter orchestration, simulator config reads,
and visit/currency detection. `pet-function/src/apps/InventoryCatMascot.jsx` owns
the Inventory mascot dialogue runtime. `pet-function/src/apps/repositories/inventory.ts`
owns pet persistence query mapping.

The corresponding 33 Inventory modules retain their full old implementation as
`// PET_FUNCTION_ARCHIVE_BEGIN` / `// PET_FUNCTION_ARCHIVE_END` comments, followed
by imports/re-exports or small factories. Do not uncomment the archived versions.
Unused legacy chat functions in App.tsx are also commented out, not deleted.

Inventory still owns authentication/SSO, the configured Supabase client, live room/history/log
loading used by its business UI, server AI transports, navigation and confirmation/execution
of real stock operations. These are injected into the shared code; the package does not
store service-role keys or create a separate account/session. Pet userId remains host-authoritative.
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
For future releases, the user pushes the new source and publishes a NEW version tag.
Update the manifest to that tag, run npm install to regenerate the lockfile and replace
the installation, then repeat the checks above before committing/deploying.
No commit, push, tag, publication or deployment was performed in this local migration.
This integration adds no paid service or paid import operation.
