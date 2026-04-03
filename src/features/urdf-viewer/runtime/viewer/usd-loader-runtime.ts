// Keep the upstream loader in vendored JavaScript so it stays diffable against
// usd-viewer, but expose it through a typed TypeScript boundary for the rest of
// URDF Studio.
export { loadUsdStage } from './usd-loader.js';
export type {
  LoadUsdStageArgs,
  LoadUsdStageFn,
  LoadUsdStageResult,
  UsdFsHelperInstance,
  UsdModule,
} from './usd-loader.types';
