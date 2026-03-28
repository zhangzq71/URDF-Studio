import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDocumentLoadingOverlayPresentation } from './documentLoadingOverlayPresentation.ts';

test('USD loading blocks the viewport until the stage is ready', () => {
  const presentation = resolveDocumentLoadingOverlayPresentation({
    status: 'loading',
    format: 'usd',
  });

  assert.equal(presentation.blocksViewport, true);
  assert.match(presentation.overlayClassName, /items-center justify-center/);
  assert.match(presentation.overlayClassName, /bg-google-light-bg\/96 dark:bg-google-dark-bg\/96/);
  assert.equal(
    presentation.hudWrapperClassName,
    'pointer-events-none flex w-full items-center justify-center',
  );
});

test('non-USD loading keeps the lightweight corner HUD presentation', () => {
  const presentation = resolveDocumentLoadingOverlayPresentation({
    status: 'loading',
    format: 'urdf',
  });

  assert.equal(presentation.blocksViewport, false);
  assert.equal(
    presentation.overlayClassName,
    'pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-4',
  );
  assert.equal(presentation.hudWrapperClassName, undefined);
});
