import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { validateXmlDocumentByFlavor } from './xmlDocumentValidation.ts';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

test('reports XML parse failures for xacro validation', () => {
  const errors = validateXmlDocumentByFlavor('<robot><link></robot>', 'xacro');
  assert.ok(errors.length > 0);
  assert.ok(errors[0].message.toLowerCase().includes('xml'));
});

test('reports SDF root and structural issues', () => {
  const errors = validateXmlDocumentByFlavor(`<?xml version="1.0"?>
<sdf>
  <model>
    <link />
    <joint>
      <parent>base</parent>
    </joint>
  </model>
</sdf>`, 'sdf');

  assert.ok(errors.some((error) => error.message.includes('version attribute')));
  assert.ok(errors.some((error) => error.message.includes('model #1 missing name attribute')));
  assert.ok(errors.some((error) => error.message.includes('link #1 missing name attribute')));
  assert.ok(errors.some((error) => error.message.includes('joint #1 missing name attribute')));
  assert.ok(errors.some((error) => error.message.includes('missing type attribute')));
  assert.ok(errors.some((error) => error.message.includes('missing <child> element')));
});

test('reports invalid SDF joint type enum values', () => {
  const errors = validateXmlDocumentByFlavor(`<?xml version="1.0"?>
<sdf version="1.10">
  <model name="demo">
    <link name="base"/>
    <link name="tip"/>
    <joint name="bad_joint" type="spinny">
      <parent>base</parent>
      <child>tip</child>
    </joint>
  </model>
</sdf>`, 'sdf');

  assert.ok(errors.some((error) => error.message.includes('invalid type "spinny"')));
});

test('reports invalid MJCF enum values and missing worldbody', () => {
  const errors = validateXmlDocumentByFlavor(`<?xml version="1.0"?>
<mujoco model="demo">
  <body name="base">
    <geom type="polyhedron"/>
    <joint type="twist"/>
  </body>
</mujoco>`, 'mjcf');

  assert.ok(errors.some((error) => error.message.includes('missing required <worldbody>')));
  assert.ok(errors.some((error) => error.message.includes('invalid type "polyhedron"')));
  assert.ok(errors.some((error) => error.message.includes('invalid type "twist"')));
});

test('accepts minimal valid MJCF and SDF snippets', () => {
  const mjcfErrors = validateXmlDocumentByFlavor(`<?xml version="1.0"?>
<mujoco model="demo">
  <worldbody>
    <body name="base">
      <geom type="box" size="0.1 0.1 0.1"/>
      <joint type="hinge" axis="0 0 1"/>
    </body>
  </worldbody>
</mujoco>`, 'mjcf');

  const sdfErrors = validateXmlDocumentByFlavor(`<?xml version="1.0"?>
<sdf version="1.10">
  <model name="demo">
    <link name="base"/>
  </model>
</sdf>`, 'sdf');

  assert.equal(mjcfErrors.length, 0);
  assert.equal(sdfErrors.length, 0);
});
