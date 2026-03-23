Upstream source: `https://github.com/OpenLegged/usd-viewer`

Vendored commit:
`e0912e0d2e67ec9884a8b5808ef6599d7bda2032`

Vendored into this module on purpose:
- `runtime/hydra/*`
- `runtime/viewer/*`
- `runtime/embed/usd-viewer-api.ts`
- `runtime/vendor/usd-text-parser/*`

Notes:
- These files are kept inside `src/features/urdf-viewer/runtime` so URDF Studio can bundle and call the usd-viewer runtime directly.
- URDF Studio should adapt usd-viewer runtime output into its own `RobotData` interface, not re-implement USDA parsing in `src/core/parsers/usd/*`.
- Static WASM bindings remain in `public/usd/bindings/*` because they must stay fetchable at runtime.
