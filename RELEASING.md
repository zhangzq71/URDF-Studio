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
npm run version:bump -- --app minor
npm run version:bump -- --package patch
npm run version:bump -- --app 2.1.0 --package 0.2.0
```

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
