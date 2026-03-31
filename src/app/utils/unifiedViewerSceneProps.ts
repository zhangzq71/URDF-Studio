import type { Object3D as ThreeObject3D } from 'three';
import {
  buildURDFViewerSceneProps,
  type URDFViewerController,
  type URDFViewerProps,
  type URDFViewerSceneBaseProps,
  type ViewerDocumentLoadEvent,
  type ViewerResourceScope,
  type ViewerRobotDataResolution,
} from '@/features/urdf-viewer';
import type { RobotFile, RobotState } from '@/types';

export const EMPTY_VIEWER_SELECTION = {
  type: null,
  id: null,
} satisfies NonNullable<URDFViewerProps['selection']>;

interface BuildUnifiedViewerScenePropsArgs {
  controller: URDFViewerController;
  active: boolean;
  hasActivePreview: boolean;
  hoveredSelection?: URDFViewerProps['hoveredSelection'];
  viewerResourceScope: ViewerResourceScope;
  retainedRobot?: ThreeObject3D | null;
  effectiveSourceFile: RobotFile | null | undefined;
  effectiveSourceFilePath?: string;
  effectiveUrdfContent: string;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  onSceneReadyForDisplay?: () => void;
  onRuntimeRobotLoaded?: (robot: ThreeObject3D) => void;
  mode: 'detail';
  selection?: URDFViewerProps['selection'];
  onHover?: URDFViewerProps['onHover'];
  onMeshSelect?: URDFViewerProps['onMeshSelect'];
  robot: RobotState;
  focusTarget?: string | null;
  onCollisionTransformPreview?: URDFViewerProps['onCollisionTransformPreview'];
  onCollisionTransform?: URDFViewerProps['onCollisionTransform'];
  isMeshPreview?: boolean;
  viewerReloadKey?: number;
}

export function buildUnifiedViewerSceneProps({
  controller,
  active,
  hasActivePreview,
  hoveredSelection,
  viewerResourceScope,
  retainedRobot,
  effectiveSourceFile,
  effectiveSourceFilePath,
  effectiveUrdfContent,
  onRobotDataResolved,
  onDocumentLoadEvent,
  onSceneReadyForDisplay,
  onRuntimeRobotLoaded,
  mode,
  selection,
  onHover,
  onMeshSelect,
  robot,
  focusTarget,
  onCollisionTransformPreview,
  onCollisionTransform,
  isMeshPreview = false,
  viewerReloadKey = 0,
}: BuildUnifiedViewerScenePropsArgs): URDFViewerSceneBaseProps {
  const previewBlocksInteraction = hasActivePreview || !active;

  return buildURDFViewerSceneProps({
    controller,
    active,
    sourceFile: effectiveSourceFile,
    availableFiles: viewerResourceScope.availableFiles,
    urdfContent: effectiveUrdfContent,
    assets: viewerResourceScope.assets,
    onRobotDataResolved,
    onDocumentLoadEvent,
    onSceneReadyForDisplay,
    retainedRobot,
    onRuntimeRobotLoaded,
    sourceFilePath: effectiveSourceFilePath,
    mode: hasActivePreview ? 'detail' : mode,
    selection: hasActivePreview ? EMPTY_VIEWER_SELECTION : selection,
    hoveredSelection: hasActivePreview ? undefined : hoveredSelection,
    hoverSelectionEnabled: !previewBlocksInteraction,
    onHover: previewBlocksInteraction ? undefined : onHover,
    onMeshSelect: previewBlocksInteraction ? undefined : onMeshSelect,
    robotLinks: hasActivePreview ? undefined : robot.links,
    robotJoints: hasActivePreview ? undefined : robot.joints,
    focusTarget: hasActivePreview ? undefined : focusTarget,
    onCollisionTransformPreview: hasActivePreview ? undefined : onCollisionTransformPreview,
    onCollisionTransform: hasActivePreview ? undefined : onCollisionTransform,
    isMeshPreview: hasActivePreview ? false : isMeshPreview,
    runtimeInstanceKey: viewerReloadKey,
  });
}
