import test from 'node:test';
import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box } from 'lucide-react';

import { Header } from './Header.tsx';

test('Header keeps the leading logo at a readable non-shrinking size', () => {
  const markup = renderToStaticMarkup(
    React.createElement(Header, {
      onImportFile: () => {},
      onImportFolder: () => {},
      onOpenExport: () => {},
      onExportProject: () => {},
      onOpenAI: () => {},
      onOpenMeasureTool: () => {},
      onOpenCodeViewer: () => {},
      onPrefetchCodeViewer: () => {},
      onOpenSettings: () => {},
      onSnapshot: () => {},
      onOpenCollisionOptimizer: () => {},
      quickAction: {
        label: 'Quick action',
        icon: Box,
        onClick: () => {},
      },
      secondaryAction: {
        label: 'Secondary action',
        icon: Box,
        onClick: () => {},
      },
      viewConfig: {
        showToolbar: true,
        showOptionsPanel: true,
        showVisualizerOptionsPanel: true,
        showJointPanel: true,
      },
      setViewConfig: () => {},
    }),
  );

  const logoTag = markup.match(/<img[^>]*src="\/logos\/logo\.png"[^>]*>/)?.[0];
  assert.ok(logoTag, 'header should render the leading brand logo');
  assert.match(logoTag, /h-8/, 'logo should keep a balanced readable height');
  assert.match(logoTag, /w-8/, 'logo should keep a balanced readable width');
  assert.match(logoTag, /shrink-0/, 'logo should not shrink when header content gets dense');
});
