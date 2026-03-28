import type { RobotFile } from '@/types';
import { prewarmUsdWasmRuntimeInBackground } from '../../features/urdf-viewer/utils/usdWasmRuntime.ts';
import { prewarmPreparedUsdStageOpenDataInBackground } from '../../features/urdf-viewer/utils/preparedUsdStageOpenCache.ts';

type StageOpenSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
type StageOpenAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

interface UsdSelectionPrewarmDependencies {
  prewarmRuntime: () => void;
  prewarmStageOpen: (
    file: StageOpenSourceFile,
    availableFiles: StageOpenAvailableFile[],
    assets: Record<string, string>,
  ) => void;
}

export function createUsdSelectionPrewarmHandler(
  {
    prewarmRuntime,
    prewarmStageOpen,
  }: UsdSelectionPrewarmDependencies,
): (
  file: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
) => void {
  return (file, availableFiles, assets) => {
    if (file.format !== 'usd') {
      return;
    }

    prewarmRuntime();
    prewarmStageOpen(file, availableFiles, assets);
  };
}

export const prewarmUsdSelectionInBackground = createUsdSelectionPrewarmHandler({
  prewarmRuntime: prewarmUsdWasmRuntimeInBackground,
  prewarmStageOpen: prewarmPreparedUsdStageOpenDataInBackground,
});
