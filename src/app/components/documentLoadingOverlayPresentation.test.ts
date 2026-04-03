import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDocumentLoadingOverlayPresentation } from './documentLoadingOverlayPresentation.ts';

test('USD loading keeps the lightweight corner HUD presentation', () => {
  const presentation = resolveDocumentLoadingOverlayPresentation({
    status: 'loading',
    format: 'usd',
  });

  assert.equal(presentation.blocksViewport, false);
  assert.equal(
    presentation.overlayClassName,
    'pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-4',
  );
  assert.equal(presentation.hudWrapperClassName, undefined);
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
