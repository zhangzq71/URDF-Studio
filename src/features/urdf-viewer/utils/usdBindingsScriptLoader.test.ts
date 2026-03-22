import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import {
  buildUsdBindingsScriptUrl,
  ensureClassicScriptLoaded,
  resetClassicScriptLoaderForTests,
} from './usdBindingsScriptLoader.ts';

test('builds the USD bindings script URL with the cache key on the raw public path', () => {
  assert.equal(
    buildUsdBindingsScriptUrl('20260318a'),
    '/usd/bindings/emHdBindings.js?v=20260318a',
  );
});

test('injects the USD bindings as a classic script instead of a module import', async () => {
  resetClassicScriptLoaderForTests();

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost:3000/',
  });

  const loadPromise = ensureClassicScriptLoaded(
    '/usd/bindings/emHdBindings.js?v=20260318a',
    dom.window.document,
  );

  const injectedScripts = dom.window.document.head.querySelectorAll('script[src]');
  assert.equal(injectedScripts.length, 1);

  const injectedScript = injectedScripts[0] as HTMLScriptElement;
  assert.equal(injectedScript.getAttribute('type'), null);
  assert.match(
    injectedScript.src,
    /\/usd\/bindings\/emHdBindings\.js\?v=20260318a$/,
  );

  injectedScript.dispatchEvent(new dom.window.Event('load'));
  await loadPromise;
});

test('deduplicates concurrent USD bindings script loads for the same document and src', async () => {
  resetClassicScriptLoaderForTests();

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost:3000/',
  });

  const firstPromise = ensureClassicScriptLoaded(
    '/usd/bindings/emHdBindings.js?v=20260318a',
    dom.window.document,
  );
  const secondPromise = ensureClassicScriptLoaded(
    '/usd/bindings/emHdBindings.js?v=20260318a',
    dom.window.document,
  );

  assert.strictEqual(firstPromise, secondPromise);
  assert.equal(dom.window.document.head.querySelectorAll('script[src]').length, 1);

  const injectedScript = dom.window.document.head.querySelector('script[src]');
  assert.ok(injectedScript);

  injectedScript.dispatchEvent(new dom.window.Event('load'));
  await Promise.all([firstPromise, secondPromise]);
});
