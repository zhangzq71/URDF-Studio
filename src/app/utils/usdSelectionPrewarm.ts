import type { RobotFile } from '@/types';
import { prewarmUsdWasmRuntimeInBackground } from '../../features/urdf-viewer/utils/usdWasmRuntime.ts';
import { prewarmUsdOffscreenViewerRuntimeInBackground } from '../../features/urdf-viewer/utils/usdOffscreenViewerWorkerClient.ts';
import { prewarmPreparedUsdStageOpenDataInBackground } from '../../features/urdf-viewer/utils/preparedUsdStageOpenCache.ts';
import { hasBlobBackedLargeUsdaInStageScope } from '../../features/urdf-viewer/utils/usdBlobBackedUsda.ts';

type StageOpenSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
type StageOpenAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

interface UsdSelectionPrewarmDependencies {
  prewarmMainThreadRuntime: () => void;
  prewarmOffscreenRuntime: () => void;
  prewarmStageOpen: (
    file: StageOpenSourceFile,
    availableFiles: StageOpenAvailableFile[],
    assets: Record<string, string>,
  ) => void;
}

export function createUsdSelectionPrewarmHandler({
  prewarmMainThreadRuntime,
  prewarmOffscreenRuntime,
  prewarmStageOpen,
}: UsdSelectionPrewarmDependencies): (
  file: StageOpenSourceFile,
  availableFiles: StageOpenAvailableFile[],
  assets: Record<string, string>,
) => void {
  return (file, availableFiles, assets) => {
    if (file.format !== 'usd') {
      return;
    }

    prewarmMainThreadRuntime();
    prewarmOffscreenRuntime();

    if (hasBlobBackedLargeUsdaInStageScope(file, availableFiles)) {
      return;
    }

    prewarmStageOpen(file, availableFiles, assets);
  };
}

export const prewarmUsdSelectionInBackground = createUsdSelectionPrewarmHandler({
  prewarmMainThreadRuntime: prewarmUsdWasmRuntimeInBackground,
  prewarmOffscreenRuntime: prewarmUsdOffscreenViewerRuntimeInBackground,
  prewarmStageOpen: prewarmPreparedUsdStageOpenDataInBackground,
});
