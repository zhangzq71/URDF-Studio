import { memo, useCallback } from 'react';
import { translations } from '@/shared/i18n';
import { useEffectiveTheme, useResolvedTheme } from '@/shared/hooks';
import { useUIStore } from '@/store';
import { useSelectionStore } from '@/store/selectionStore';
import type { URDFViewerProps } from '../types';
import { useURDFViewerController } from '../hooks/useURDFViewerController';
import { buildURDFViewerSceneProps } from '../utils/viewerSceneProps';
import { resolveStandaloneViewerHoverSelectionWiring } from '../utils/standaloneHoverSelectionWiring';
import { resolveDefaultViewerToolMode } from '../utils/scopedToolMode';
import { URDFViewerCanvas } from './URDFViewerCanvas';
import { URDFViewerPanels } from './URDFViewerPanels';
import { URDFViewerScene } from './URDFViewerScene';

export const URDFViewer = memo(function URDFViewer({
  urdfContent,
  assets,
  sourceFile,
  sourceFormat,
  availableFiles = [],
  onRobotDataResolved,
  onDocumentLoadEvent,
  onJointChange,
  syncJointChangesToApp = false,
  jointAngleState,
  jointMotionState,
  lang,
  theme,
  mode = 'editor',
  onSelect,
  onMeshSelect,
  onHover,
  onUpdate,
  selection,
  hoveredSelection,
  robotLinks,
  robotJoints,
  sourceFilePath,
  focusTarget,
  showVisual,
  setShowVisual,
  snapshotAction,
  isMeshPreview = false,
  onCollisionTransformPreview,
  onCollisionTransform,
  showToolbar = true,
  setShowToolbar,
  showOptionsPanel = true,
  setShowOptionsPanel,
  showJointPanel = true,
  setShowJointPanel,
  onTransformPendingChange,
  groundPlaneOffset: propGroundPlaneOffset,
}: URDFViewerProps) {
  const t = translations[lang];
  const storeGroundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
  const setStoreGroundPlaneOffset = useUIStore((state) => state.setGroundPlaneOffset);
  const { shouldSubscribeToStoreHoveredSelection, hoverSelectionEnabled } =
    resolveStandaloneViewerHoverSelectionWiring({
      hoveredSelection,
      sourceFormat: sourceFile?.format ?? sourceFormat,
      isMeshPreview,
    });
  const storeHoveredSelection = useSelectionStore(
    useCallback(
      (state) => (shouldSubscribeToStoreHoveredSelection ? state.hoveredSelection : undefined),
      [shouldSubscribeToStoreHoveredSelection],
    ),
  );
  const groundPlaneOffset = propGroundPlaneOffset ?? storeGroundPlaneOffset;
  const resolvedHoveredSelection = hoveredSelection ?? storeHoveredSelection;
  const inheritedTheme = useEffectiveTheme();
  const explicitTheme = useResolvedTheme(theme ?? 'system');
  const resolvedTheme = theme ? explicitTheme : inheritedTheme;
  const defaultToolMode = resolveDefaultViewerToolMode(sourceFile?.format ?? sourceFormat);
  const toolModeScopeKey = sourceFile
    ? `${sourceFile.format}:${sourceFile.name}`
    : sourceFilePath
      ? `inline:${sourceFilePath}`
      : 'inline:urdf-viewer';
  const controller = useURDFViewerController({
    onJointChange,
    syncJointChangesToApp,
    showJointPanel,
    jointAngleState,
    jointMotionState,
    onSelect,
    onMeshSelect,
    onHover,
    selection,
    showVisual,
    setShowVisual,
    onTransformPendingChange,
    groundPlaneOffset,
    setGroundPlaneOffset: setStoreGroundPlaneOffset,
    groundPlaneOffsetReadOnly: propGroundPlaneOffset !== undefined,
    defaultToolMode,
    toolModeScopeKey,
  });
  const sceneProps = buildURDFViewerSceneProps({
    resolvedTheme,
    controller,
    sourceFile,
    sourceFormat,
    availableFiles,
    urdfContent,
    assets,
    onRobotDataResolved,
    onDocumentLoadEvent,
    sourceFilePath,
    groundPlaneOffset,
    mode,
    selection,
    hoveredSelection: resolvedHoveredSelection,
    hoverSelectionEnabled,
    onHover,
    onMeshSelect,
    robotLinks,
    robotJoints,
    focusTarget,
    onCollisionTransformPreview,
    onCollisionTransform,
    isMeshPreview,
  });

  return (
    <div
      ref={controller.containerRef}
      className="flex-1 relative h-full min-w-0 bg-google-light-bg dark:bg-google-dark-bg"
      onMouseMove={controller.handleMouseMove}
      onMouseUp={controller.handleMouseUp}
    >
      <URDFViewerPanels
        lang={lang}
        controller={controller}
        onUpdate={onUpdate}
        showToolbar={showToolbar}
        setShowToolbar={setShowToolbar}
        showOptionsPanel={showOptionsPanel}
        setShowOptionsPanel={setShowOptionsPanel}
        showJointPanel={showJointPanel}
        setShowJointPanel={setShowJointPanel}
      />

      <URDFViewerCanvas
        lang={lang}
        resolvedTheme={resolvedTheme}
        groundOffset={groundPlaneOffset}
        snapshotAction={snapshotAction}
        robotName={controller.robot?.name || 'robot'}
        orbitEnabled={!controller.isDragging}
        onOrbitStart={() => {
          controller.isOrbitDragging.current = true;
        }}
        onOrbitEnd={() => {
          controller.isOrbitDragging.current = false;
        }}
        onPointerMissed={controller.handlePointerMissed}
        contextLostMessage={t.webglContextRestoring}
      >
        <URDFViewerScene {...sceneProps} t={t} />
      </URDFViewerCanvas>
    </div>
  );
});

export default URDFViewer;
