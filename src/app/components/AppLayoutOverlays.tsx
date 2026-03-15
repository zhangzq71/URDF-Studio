import React, { lazy, Suspense } from 'react';
import { LazyOverlayFallback } from './LazyOverlayFallback';
import { loadSourceCodeEditorModule } from '@/app/utils/sourceCodeEditorLoader';
import {
  loadBridgeCreateModalModule,
  loadCollisionOptimizationDialogModule,
} from '@/app/utils/overlayLoaders';
import type { Language } from '@/shared/i18n';
import type { Theme, UrdfJoint } from '@/types';
import type { AssemblyState } from '@/types';
import type {
  CollisionOptimizationOperation,
  CollisionOptimizationSource,
  CollisionTargetRef,
} from '@/features/property-editor/utils';

const SourceCodeEditor = lazy(() =>
  loadSourceCodeEditorModule().then((module) => ({ default: module.SourceCodeEditor }))
);

const CollisionOptimizationDialog = lazy(() =>
  loadCollisionOptimizationDialogModule().then((module) => ({ default: module.CollisionOptimizationDialog }))
);

const BridgeCreateModal = lazy(() =>
  loadBridgeCreateModalModule().then((module) => ({ default: module.BridgeCreateModal }))
);

interface AppLayoutOverlaysProps {
  isCodeViewerOpen: boolean;
  sourceCodeContent: string;
  onCodeChange: (newCode: string) => void;
  onCloseCodeViewer: () => void;
  theme: Theme;
  selectedFileName?: string;
  robotName: string;
  lang: Language;
  loadingEditorLabel: string;
  isCollisionOptimizerOpen: boolean;
  loadingOptimizerLabel: string;
  collisionOptimizationSource: CollisionOptimizationSource;
  assets: Record<string, string>;
  selection: {
    type: 'link' | 'joint' | null;
    id: string | null;
    subType?: 'visual' | 'collision';
    objectIndex?: number;
  };
  onCloseCollisionOptimizer: () => void;
  onSelectCollisionTarget: (target: CollisionTargetRef) => void;
  onApplyCollisionOptimization: (operations: CollisionOptimizationOperation[]) => void;
  assemblyState: AssemblyState | null;
  shouldRenderBridgeModal: boolean;
  loadingBridgeDialogLabel: string;
  isBridgeModalOpen: boolean;
  onCloseBridgeModal: () => void;
  onCreateBridge: (params: {
    name: string;
    parentComponentId: string;
    parentLinkId: string;
    childComponentId: string;
    childLinkId: string;
    joint: Partial<UrdfJoint>;
  }) => unknown;
}

export function AppLayoutOverlays({
  isCodeViewerOpen,
  sourceCodeContent,
  onCodeChange,
  onCloseCodeViewer,
  theme,
  selectedFileName,
  robotName,
  lang,
  loadingEditorLabel,
  isCollisionOptimizerOpen,
  loadingOptimizerLabel,
  collisionOptimizationSource,
  assets,
  selection,
  onCloseCollisionOptimizer,
  onSelectCollisionTarget,
  onApplyCollisionOptimization,
  assemblyState,
  shouldRenderBridgeModal,
  loadingBridgeDialogLabel,
  isBridgeModalOpen,
  onCloseBridgeModal,
  onCreateBridge,
}: AppLayoutOverlaysProps) {
  const codeEditorFileName = selectedFileName
    ? selectedFileName.split('/').pop() || `${robotName}.urdf`
    : `${robotName}.urdf`;

  return (
    <>
      {isCodeViewerOpen && (
        <Suspense fallback={<LazyOverlayFallback label={loadingEditorLabel} />}>
          <SourceCodeEditor
            code={sourceCodeContent}
            onCodeChange={onCodeChange}
            onClose={onCloseCodeViewer}
            theme={theme}
            fileName={codeEditorFileName}
            lang={lang}
          />
        </Suspense>
      )}

      {isCollisionOptimizerOpen && (
        <Suspense fallback={<LazyOverlayFallback label={loadingOptimizerLabel} />}>
          <CollisionOptimizationDialog
            source={collisionOptimizationSource}
            lang={lang}
            assets={assets}
            selection={selection}
            onClose={onCloseCollisionOptimizer}
            onSelectTarget={onSelectCollisionTarget}
            onApply={onApplyCollisionOptimization}
          />
        </Suspense>
      )}

      {assemblyState && shouldRenderBridgeModal && (
        <Suspense fallback={<LazyOverlayFallback label={loadingBridgeDialogLabel} />}>
          <BridgeCreateModal
            isOpen={isBridgeModalOpen}
            onClose={onCloseBridgeModal}
            onCreate={onCreateBridge}
            assemblyState={assemblyState}
            lang={lang}
          />
        </Suspense>
      )}
    </>
  );
}
