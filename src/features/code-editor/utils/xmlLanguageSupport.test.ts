import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDocumentLanguageId,
  getXmlCompletionEntries,
  supportsDocumentValidation,
} from './xmlLanguageSupport.ts';

test('maps Xacro documents to the dedicated editable language mode', () => {
  assert.equal(getDocumentLanguageId('xacro'), 'xacro');
  assert.equal(supportsDocumentValidation('xacro'), false);
});

test('returns URDF tags and snippets in URDF tag context', () => {
  const labels = getXmlCompletionEntries('urdf', '<').map((entry) => entry.label);

  assert.ok(labels.includes('robot'));
  assert.ok(!labels.includes('link'));
  assert.ok(!labels.includes('joint-snippet'));
  assert.ok(!labels.includes('xacro:macro'));
});

test('returns URDF joint type values inside joint type attributes', () => {
  const labels = getXmlCompletionEntries('urdf', '<joint type="').map((entry) => entry.label);

  assert.ok(labels.includes('revolute'));
  assert.ok(labels.includes('continuous'));
  assert.ok(labels.includes('fixed'));
});

test('returns Xacro-specific tags and snippets only for xacro documents', () => {
  const xacroLabels = getXmlCompletionEntries('xacro', '<xacro:').map((entry) => entry.label);
  const mjcfLabels = getXmlCompletionEntries('mjcf', '<').map((entry) => entry.label);

  assert.ok(xacroLabels.includes('xacro:macro'));
  assert.ok(xacroLabels.includes('macro-snippet'));
  assert.equal(mjcfLabels.length, 0);
});

test('returns schema-derived URDF tags and attributes beyond the original hardcoded set', () => {
  const tagLabels = getXmlCompletionEntries('urdf', '<robot>\n  <').map((entry) => entry.label);
  const attributeLabels = getXmlCompletionEntries('urdf', '<robot ').map((entry) => entry.label);

  assert.ok(tagLabels.includes('sensor'));
  assert.ok(tagLabels.includes('gazebo'));
  assert.ok(attributeLabels.includes('version'));
});

test('limits URDF child tag suggestions to the active robot parent context', () => {
  const labels = getXmlCompletionEntries('urdf', '<robot>\n  <').map((entry) => entry.label);

  assert.ok(labels.includes('link'));
  assert.ok(labels.includes('joint'));
  assert.ok(labels.includes('joint-snippet'));
  assert.ok(!labels.includes('limit'));
});

test('limits URDF child tag suggestions to the active joint parent context', () => {
  const labels = getXmlCompletionEntries(
    'urdf',
    '<robot name="demo">\n  <joint name="base_joint" type="fixed">\n    <',
  ).map((entry) => entry.label);

  assert.ok(labels.includes('parent'));
  assert.ok(labels.includes('child'));
  assert.ok(labels.includes('limit'));
  assert.ok(!labels.includes('link'));
  assert.ok(!labels.includes('joint-snippet'));
});

test('reuses cached completion arrays for repeated contexts to keep suggest cheap', () => {
  const first = getXmlCompletionEntries('urdf', '<robot ');
  const second = getXmlCompletionEntries('urdf', '<robot ');

  assert.equal(first, second);
});

test('reuses cached child-tag arrays for repeated parent contexts', () => {
  const prefix = '<robot name="demo">\n  <joint name="base_joint" type="fixed">\n    <';
  const first = getXmlCompletionEntries('urdf', prefix);
  const second = getXmlCompletionEntries('urdf', prefix);

  assert.equal(first, second);
});
