import React from 'react';

import type { RobotFile, RobotState } from '@/types';
import {
  type URDFViewerController,
  type ViewerDocumentLoadEvent,
  type ViewerHelperKind,
  type ViewerResourceScope,
  type ViewerRobotDataResolution,
  type ViewerRobotSourceFormat,
  URDFViewerScene,
} from '@/features/urdf-viewer';
import { useSelectionStore } from '@/store/selectionStore';

import { buildUnifiedViewerSceneProps } from '@/app/utils/unifiedViewerSceneProps';
import type { FilePreviewState } from './types';

interface ViewerSceneConnectorProps {
  controller: URDFViewerController;
  active: boolean;
  activePreview?: FilePreviewState;
  viewerResourceScope: ViewerResourceScope;
  retainedRobot?: import('three').Object3D | null;
  effectiveSourceFile: RobotFile | null | undefined;
  effectiveSourceFilePath?: string;
  effectiveUrdfContent: string;
  effectiveSourceFormat?: ViewerRobotSourceFormat;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  onDocumentLoadEvent?: (event: ViewerDocumentLoadEvent) => void;
  onSceneReadyForDisplay?: () => void;
  onRuntimeRobotLoaded?: (robot: import('three').Object3D) => void;
  mode: 'editor';
  selection?: {
    type: 'link' | 'joint' | null;
    id: string | null;
    subType?: 'visual' | 'collision';
    objectIndex?: number;
    helperKind?: ViewerHelperKind;
  };
  onHover?: (
    type: 'link' | 'joint' | null,
    id: string | null,
    subType?: 'visual' | 'collision',
    objectIndex?: number,
    helperKind?: ViewerHelperKind,
  ) => void;
  onMeshSelect?: (
    linkId: string,
    jointId: string | null,
    objectIndex: number,
    objectType: 'visual' | 'collision',
  ) => void;
  robot: RobotState;
  focusTarget?: string | null;
  onCollisionTransformPreview?: (
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => void;
  onCollisionTransform?: (
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => void;
  isMeshPreview?: boolean;
  viewerReloadKey?: number;
  sourceSceneAssemblyComponentId?: string | null;
  sourceSceneAssemblyComponentTransform?: {
    position: { x: number; y: number; z: number };
    rotation: { r: number; p: number; y: number };
  } | null;
  showSourceSceneAssemblyComponentControls?: boolean;
  onSourceSceneAssemblyComponentTransform?: (
    componentId: string,
    transform: {
      position: { x: number; y: number; z: number };
      rotation: { r: number; p: number; y: number };
    },
    options?: import('@/types/viewer').UpdateCommitOptions,
  ) => void;
  t: typeof import('@/shared/i18n').translations.en;
}

export const ViewerSceneConnector = React.memo(function ViewerSceneConnector({
  controller,
  active,
  activePreview,
  viewerResourceScope,
  retainedRobot,
  effectiveSourceFile,
  effectiveSourceFilePath,
  effectiveUrdfContent,
  effectiveSourceFormat,
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
  sourceSceneAssemblyComponentId = null,
  sourceSceneAssemblyComponentTransform = null,
  showSourceSceneAssemblyComponentControls = false,
  onSourceSceneAssemblyComponentTransform,
  t,
}: ViewerSceneConnectorProps) {
  const shouldSubscribeToHoveredSelection = effectiveSourceFile?.format === 'usd' && !isMeshPreview;
  const hoveredSelection = useSelectionStore(
    React.useCallback(
      (state) => (shouldSubscribeToHoveredSelection ? state.hoveredSelection : undefined),
      [shouldSubscribeToHoveredSelection],
    ),
  );
  const sceneProps = buildUnifiedViewerSceneProps({
    controller,
    active,
    hasActivePreview: Boolean(activePreview),
    hoveredSelection,
    viewerResourceScope,
    retainedRobot,
    effectiveSourceFile,
    effectiveSourceFilePath,
    effectiveUrdfContent,
    effectiveSourceFormat,
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
    isMeshPreview,
    viewerReloadKey,
    sourceSceneAssemblyComponentId,
    sourceSceneAssemblyComponentTransform,
    showSourceSceneAssemblyComponentControls,
    onSourceSceneAssemblyComponentTransform,
  });

  return <URDFViewerScene {...sceneProps} t={t} />;
});
