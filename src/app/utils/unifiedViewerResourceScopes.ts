import {
  createStableViewerResourceScope,
  type ViewerResourceScope,
} from '@/features/urdf-viewer';
import type { RobotFile, UrdfLink } from '@/types';

interface UnifiedViewerFilePreview {
  urdfContent: string;
  fileName: string;
}

interface BuildUnifiedViewerResourceScopesArgs {
  activePreview?: UnifiedViewerFilePreview;
  urdfContent: string;
  sourceFilePath?: string;
  sourceFile?: RobotFile | null;
  assets: Record<string, string>;
  availableFiles: RobotFile[];
  viewerRobotLinks?: Record<string, UrdfLink>;
  visualizerRobotLinks?: Record<string, UrdfLink>;
  previousViewerResourceScope: ViewerResourceScope | null;
  previousVisualizerResourceScope: ViewerResourceScope | null;
}

export interface UnifiedViewerResourceScopesState {
  effectiveUrdfContent: string;
  effectiveSourceFilePath?: string;
  effectiveSourceFile: RobotFile | null | undefined;
  activeViewportFileName: string | null;
  viewerResourceScope: ViewerResourceScope;
  visualizerResourceScope: ViewerResourceScope;
}

export function buildUnifiedViewerResourceScopes({
  activePreview,
  urdfContent,
  sourceFilePath,
  sourceFile,
  assets,
  availableFiles,
  viewerRobotLinks,
  visualizerRobotLinks,
  previousViewerResourceScope,
  previousVisualizerResourceScope,
}: BuildUnifiedViewerResourceScopesArgs): UnifiedViewerResourceScopesState {
  const effectiveUrdfContent = activePreview ? activePreview.urdfContent : urdfContent;
  const effectiveSourceFilePath = activePreview ? activePreview.fileName : sourceFilePath;
  const effectiveSourceFile = activePreview ? null : sourceFile;
  const activeViewportFileName =
    activePreview?.fileName ?? effectiveSourceFile?.name ?? effectiveSourceFilePath ?? null;

  const viewerResourceScope = createStableViewerResourceScope(previousViewerResourceScope, {
    assets,
    availableFiles,
    sourceFile: effectiveSourceFile,
    sourceFilePath: effectiveSourceFilePath,
    robotLinks: viewerRobotLinks,
  });

  const visualizerResourceScope = createStableViewerResourceScope(previousVisualizerResourceScope, {
    assets,
    availableFiles,
    sourceFile,
    sourceFilePath,
    robotLinks: visualizerRobotLinks,
  });

  return {
    effectiveUrdfContent,
    effectiveSourceFilePath,
    effectiveSourceFile,
    activeViewportFileName,
    viewerResourceScope,
    visualizerResourceScope,
  };
}
