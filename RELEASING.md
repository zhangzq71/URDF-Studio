# Releasing

This repository manages two independent semantic versions:

- `urdf-studio`: the private app workspace version used for builds and the About dialog
- `@urdf-studio/react-robot-canvas`: the published package workspace version

## Inspect Current Versions

```bash
npm run version:show
```

## Bump Versions

Examples:

```bash
# Bump the app version by one minor release
npm run version:bump -- --app minor

# Bump the published package by one patch release
npm run version:bump -- --package patch

# Set exact versions explicitly
npm run version:bump -- --app 2.1.0 --package 0.2.0
```

The bump script updates:

- root `package.json`
- root `package-lock.json` for app version changes
- `packages/react-robot-canvas/package.json`
- version references in [`README.md`](./README.md) and [`README_CN.md`](./README_CN.md)

## Changelog Policy

- Keep [`CHANGELOG.md`](./CHANGELOG.md) in Keep a Changelog format.
- Update the `Unreleased` section while work is in progress.
- When cutting a release, move the relevant notes into a dated version section.

## Verification

For app-only releases:

```bash
npm run build
```

For package releases:

```bash
npm run build:package:react-robot-canvas
npm run pack:package:react-robot-canvas
```

If both changed, run both verification paths before tagging or publishing.

## Publishing The Package Workspace

After bumping the package version and validating the build:

```bash
cd packages/react-robot-canvas
npm publish
```
