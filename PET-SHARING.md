# Shared cat integration

Inventory and its pet-function dependency use version **0.12.2**.
The manifest and lockfile target GitHub tag `v0.12.2`, resolving to
`8a1993a66d60087829519c053ee7de0ed3475320`. The npm build approval matches
that release commit. No sibling-folder link is configured.
Real authenticated acceptance checks remain necessary.
The package is maintained in the separate `intern/pet-function` repository, not mrbur or molar-experience.

Shared: cat rendering, pet UI and care/game runtime, AI chat UI, pet options, images, and the shared mini-games.
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

`scripts/prepare-pet.mjs` restores and verifies the installed release's resource
packs and prepares non-game images before dev/build.
The shared Vite plugin serves games directly from the installed package during development,
and emits identical package games into `dist/games` for deployment.
The postbuild script splits oversized WASM and PCK files, verifies their bytes,
and patches Godot loaders to reconstruct them, including Kart Racing's shared
engine. All deployment assets must remain within 25 MiB.
PWA precaching excludes games because their loaders are rewritten after the
precache manifest is generated; game routes also retain their navigation fallback
exclusion. This prevents stale chunk metadata from being reused after updates.
There are no executable game copies under `public/games`.
The historical URL directory `molar-experience` is only an image path; it does not identify an old package dependency.

Verify locally:

```
npm run build
node node_modules/typescript/bin/tsc -p tsconfig.pet-check.json --noEmit
node scripts/verify-pet.mjs
node --test tests/cloudflare-game-assets.node-test.mjs
```

Authenticated manual checks remain necessary: inventory-aware dialogue, care/shop wallet persistence,
all games and rewards, Meowdoku progress/check-in, sign-out and account switching.

Resource verification compares every emitted game file with the installed
release, reconstructs split WASM/PCK byte-for-byte, and checks deployment asset
sizes. Run it after the production build. The resource regression tests use
temporary local files and mocked fetch; no real database or AI calls are needed.
No database migration is required for this version update.
Commit the manifest, regenerated lockfile, resource scripts, documentation and
regression tests together. Generated dist and public/pet-function stay untracked.

Updating shared source does not automatically update a deployed application: publish a new package/tag,
update this repository's dependency and lockfile, then rebuild/redeploy Inventory.
For future releases, the user pushes the new source and publishes a NEW version tag.
Update the manifest to that tag, run npm install to regenerate the lockfile and replace
the installation, then repeat the checks above before committing/deploying.
No commit, push, tag, publication or deployment was performed in this local migration.
This integration adds no paid service or paid import operation.
