# Version Management

## Goal
Unify app/package version sources, add a repeatable bump workflow, and document release steps.

## Tasks
- [ ] Inventory version touchpoints in app UI, package metadata, docs, and build config -> Verify: every live version source is listed and mapped.
- [ ] Add a single script to bump root app and package workspace versions without manual drift -> Verify: running the script updates package manifests consistently.
- [ ] Inject the app version into the frontend at build time and remove hard-coded UI version text -> Verify: About modal reads the build version instead of a literal string.
- [ ] Add a changelog and release instructions for future bumps -> Verify: repo has a documented semver/release flow.
- [ ] Run focused validation on the bump script and production build -> Verify: commands complete and reported versions match.

## Done When
- [ ] Root app, package workspace, docs, and UI no longer disagree about the current release version.
