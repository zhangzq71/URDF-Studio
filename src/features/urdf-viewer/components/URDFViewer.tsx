import { memo } from 'react';
import { translations } from '@/shared/i18n';
import { useEffectiveTheme, useResolvedTheme } from '@/shared/hooks';
import { useUIStore } from '@/store';
import { useSelectionStore } from '@/store/selectionStore';
import type { URDFViewerProps } from '../types';
import { useURDFViewerController } from '../hooks/useURDFViewerController';
import { URDFViewerCanvas } from './URDFViewerCanvas';
import { URDFViewerPanels } from './URDFViewerPanels';
import { URDFViewerScene } from './URDFViewerScene';

export const URDFViewer = memo(function URDFViewer({
  urdfContent,
  assets,
  onJointChange,
  jointAngleState,
  lang,
  theme,
  mode = 'detail',
  onSelect,
  onMeshSelect,
  onHover,
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
  const storeHoveredSelection = useSelectionStore((state) => state.hoveredSelection);
  const groundPlaneOffset = propGroundPlaneOffset ?? storeGroundPlaneOffset;
  const resolvedHoveredSelection = hoveredSelection ?? storeHoveredSelection;
  const inheritedTheme = useEffectiveTheme();
  const explicitTheme = useResolvedTheme(theme ?? 'system');
  const resolvedTheme = theme ? explicitTheme : inheritedTheme;
  const controller = useURDFViewerController({
    onJointChange,
    jointAngleState,
    onSelect,
    onMeshSelect,
    onHover,
    selection,
    showVisual,
    setShowVisual,
    onTransformPendingChange,
    groundPlaneOffset,
  });
  const hoverSelectionEnabled = resolvedHoveredSelection !== undefined;

  return (
    <div
      ref={controller.containerRef}
      className="flex-1 relative h-full min-w-0 bg-google-light-bg dark:bg-google-dark-bg"
      onMouseMove={controller.handleMouseMove}
      onMouseUp={controller.handleMouseUp}
      onMouseLeave={controller.handleMouseUp}
    >
      <URDFViewerPanels
        lang={lang}
        mode={mode}
        controller={controller}
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
        <URDFViewerScene
          controller={controller}
          urdfContent={urdfContent}
          assets={assets}
          sourceFilePath={sourceFilePath}
          groundPlaneOffset={groundPlaneOffset}
          mode={mode}
          selection={selection}
          hoveredSelection={resolvedHoveredSelection}
          hoverSelectionEnabled={hoverSelectionEnabled}
          onHover={onHover}
          onMeshSelect={onMeshSelect}
          robotLinks={robotLinks}
          robotJoints={robotJoints}
          focusTarget={focusTarget}
          onCollisionTransformPreview={onCollisionTransformPreview}
          onCollisionTransform={onCollisionTransform}
          isMeshPreview={isMeshPreview}
          t={t}
        />
      </URDFViewerCanvas>
    </div>
  );
});

export default URDFViewer;
