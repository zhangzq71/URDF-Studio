import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureWorkerXmlDomApis } from './ensureWorkerXmlDomApis';

test('ensureWorkerXmlDomApis installs DOMParser and XMLSerializer polyfills', () => {
  const scope = {} as typeof globalThis;

  ensureWorkerXmlDomApis(scope);

  assert.equal(typeof scope.DOMParser, 'function');
  assert.equal(typeof scope.XMLSerializer, 'function');

  const doc = new scope.DOMParser().parseFromString(
    '<robot><link name="base_link" /></robot>',
    'text/xml',
  );

  assert.equal(doc.querySelector('link')?.getAttribute('name'), 'base_link');
  assert.equal(
    new scope.XMLSerializer().serializeToString(doc),
    '<robot><link name="base_link" /></robot>',
  );
});
