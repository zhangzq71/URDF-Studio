# Architecture Boundaries

Last updated: 2026-04-01

## Target Dependency Direction

The intended dependency direction in `src/` remains:

`app -> features -> store -> shared -> core -> types`

Rules for new code:

- `app` should consume feature public APIs instead of deep-importing feature internals
- `features` should prefer store-mediated collaboration over direct feature-to-feature imports
- `shared` should stay UI-primitive / general helper oriented
- `core` should stay parser / algorithm / robot-logic oriented and avoid UI-layer dependencies

## Current Boundary Decisions

### Feature Public APIs

- `editor`（统一 Editor 公开入口）exposes controller + scene/panel surface through `src/features/editor/index.ts`
- `urdf-viewer`（Editor 实现子目录）retains runtime/components/utils internals through `src/features/urdf-viewer/index.ts`
- `file-io` exposes import/export entry points through `src/features/file-io/index.ts`

### Canonical Data Sources

- `DEFAULT_MOTOR_LIBRARY` canonical source: `src/shared/data/defaultMotorLibrary.json`
- `src/shared/data/motorLibrary.ts` now owns validation, normalization, and import-path detection only
- `src/features/hardware-config/index.ts` remains a compatibility re-export only

### Shared Three.js Utilities

- Generic Three.js disposal helpers live in `src/shared/utils/three/dispose.ts`
- `src/features/urdf-viewer/utils/dispose.ts` remains a compatibility re-export only

### Core Three.js Utilities

- MJCF parser material creation now consumes `src/core/utils/materialFactory.ts`
- This removes the previous `core -> shared` material factory dependency

## Remaining Architecture Exceptions

The following exceptions remain after this refactor batch and should not expand further:

- `src/shared/hooks/useTheme.ts` -> `@/store/uiStore`
- `src/shared/components/Panel/JointControlItem.tsx` -> `@/store/robotStore`
- `src/features/ai-assistant/utils/pdfExport.ts` -> `@/features/file-io/components/InspectionReportTemplate`

## Next Recommended Cleanup

1. Move inspection-report criteria/config into a neutral shared location
2. Remove the remaining `ai-assistant <-> file-io` bidirectional dependency
3. Continue shrinking `App.tsx` and `AppLayout.tsx` by pushing orchestration into app hooks
