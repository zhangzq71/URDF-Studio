import React from 'react';

const loadViewerSceneConnectorModule = () => import('./ViewerSceneConnector');
const loadViewerPanelsModule = () => import('@/features/editor');
const loadViewerJointsPanelModule = () => import('./ViewerJointsPanel');

export const LazyViewerSceneConnector = React.lazy(async () => ({
  default: (await loadViewerSceneConnectorModule()).ViewerSceneConnector,
}));

export const LazyViewerPanels = React.lazy(async () => ({
  default: (await loadViewerPanelsModule()).ViewerPanels,
}));

export const LazyViewerJointsPanel = React.lazy(async () => ({
  default: (await loadViewerJointsPanelModule()).ViewerJointsPanel,
}));

export async function preloadViewerModeModules(): Promise<void> {
  await Promise.all([
    loadViewerSceneConnectorModule(),
    loadViewerPanelsModule(),
    loadViewerJointsPanelModule(),
  ]);
}
