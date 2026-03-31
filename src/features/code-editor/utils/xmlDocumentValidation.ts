import type { SourceCodeDocumentFlavor } from '../types';
import type { UrdfValidationTexts, ValidationError } from './urdfValidation.ts';
import { validateUrdfDocument } from './urdfValidation.ts';

interface XmlValidationExtraTexts {
  missingSdfRoot: string;
  sdfMissingVersion: string;
  sdfMissingModelOrWorld: string;
  sdfModelMissingName: string;
  sdfLinkMissingName: string;
  sdfJointMissingName: string;
  sdfJointMissingType: string;
  sdfJointMissingParent: string;
  sdfJointMissingChild: string;
  invalidSdfJointType: string;
  missingMjcfRoot: string;
  missingMjcfWorldbody: string;
  invalidMjcfJointType: string;
  invalidMjcfGeomType: string;
}

export type XmlDocumentValidationTexts =
  Partial<UrdfValidationTexts>
  & Partial<XmlValidationExtraTexts>;

const defaultExtraTexts: XmlValidationExtraTexts = {
  missingSdfRoot: 'Missing <sdf> root element',
  sdfMissingVersion: '<sdf> element missing version attribute',
  sdfMissingModelOrWorld: '<sdf> must contain at least one <model> or <world>',
  sdfModelMissingName: 'SDF model #{0} missing name attribute',
  sdfLinkMissingName: 'SDF link #{0} missing name attribute',
  sdfJointMissingName: 'SDF joint #{0} missing name attribute',
  sdfJointMissingType: 'SDF joint "{0}" missing type attribute',
  sdfJointMissingParent: 'SDF joint "{0}" missing <parent> element',
  sdfJointMissingChild: 'SDF joint "{0}" missing <child> element',
  invalidSdfJointType: 'SDF joint "{0}" has invalid type "{1}"',
  missingMjcfRoot: 'Missing <mujoco> root element',
  missingMjcfWorldbody: '<mujoco> is missing required <worldbody> element',
  invalidMjcfJointType: 'MJCF <joint> has invalid type "{0}"',
  invalidMjcfGeomType: 'MJCF <geom> has invalid type "{0}"',
};

const SDF_JOINT_TYPES = new Set([
  'revolute',
  'continuous',
  'prismatic',
  'fixed',
  'ball',
  'universal',
  'revolute2',
  'screw',
  'gearbox',
]);

const MJCF_JOINT_TYPES = new Set(['hinge', 'slide', 'ball', 'free']);
const MJCF_GEOM_TYPES = new Set([
  'plane',
  'hfield',
  'sphere',
  'capsule',
  'ellipsoid',
  'cylinder',
  'box',
  'mesh',
  'sdf',
]);

const formatMsg = (msg: string, ...args: (string | number)[]): string => {
  let result = msg;
  args.forEach((arg, index) => {
    result = result.replace(`{${index}}`, String(arg));
  });
  return result;
};

const findElementLine = (xmlString: string, tagName: string, index: number): number => {
  const lines = xmlString.split('\n');
  let count = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const regex = new RegExp(`<${tagName}[\\s>/]`, 'g');
    const matches = lines[i].match(regex);
    if (matches) {
      count += matches.length;
      if (count > index) {
        return i + 1;
      }
    }
  }

  return 1;
};

const parseXmlOrCollectErrors = (
  xmlString: string,
  texts: XmlDocumentValidationTexts,
): { doc: Document | null; errors: ValidationError[] } => {
  const xmlParseErrorText = texts.xmlParseError || 'XML parsing error';
  const cannotParseXmlText = texts.cannotParseXml || 'Cannot parse XML';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const parseError = doc.querySelector('parsererror');

    if (parseError) {
      const errorText = parseError.textContent || xmlParseErrorText;
      const lineMatch = errorText.match(/line\s*(\d+)/i);
      const columnMatch = errorText.match(/column\s*(\d+)/i);
      return {
        doc: null,
        errors: [{
          line: lineMatch ? parseInt(lineMatch[1], 10) : 1,
          column: columnMatch ? parseInt(columnMatch[1], 10) : 1,
          message: `${xmlParseErrorText}: ${errorText.split('\n')[0].substring(0, 100)}`,
        }],
      };
    }

    return { doc, errors: [] };
  } catch (error) {
    return {
      doc: null,
      errors: [{
        line: 1,
        column: 1,
        message: `${cannotParseXmlText}: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
};

const validateXacroDocument = (
  xmlString: string,
  texts: XmlDocumentValidationTexts,
): ValidationError[] => {
  const { errors } = parseXmlOrCollectErrors(xmlString, texts);
  return errors;
};

const validateSdfDocument = (
  xmlString: string,
  texts: XmlDocumentValidationTexts,
): ValidationError[] => {
  const t = { ...defaultExtraTexts, ...texts };
  const { doc, errors } = parseXmlOrCollectErrors(xmlString, t);
  if (!doc) {
    return errors;
  }

  const sdfRoot = doc.querySelector('sdf');
  if (!sdfRoot) {
    return [{ line: 1, column: 1, message: t.missingSdfRoot }];
  }

  if (!sdfRoot.getAttribute('version')) {
    errors.push({
      line: findElementLine(xmlString, 'sdf', 0),
      column: 1,
      message: t.sdfMissingVersion,
    });
  }

  const hasModelOrWorldChild = Array.from(sdfRoot.children)
    .some((child) => child.tagName === 'model' || child.tagName === 'world');
  if (!hasModelOrWorldChild) {
    errors.push({
      line: findElementLine(xmlString, 'sdf', 0),
      column: 1,
      message: t.sdfMissingModelOrWorld,
    });
  }

  const models = Array.from(doc.querySelectorAll('model'));
  models.forEach((model, index) => {
    if (!model.getAttribute('name')) {
      errors.push({
        line: findElementLine(xmlString, 'model', index),
        column: 1,
        message: formatMsg(t.sdfModelMissingName, index + 1),
      });
    }
  });

  const links = Array.from(doc.querySelectorAll('link'));
  links.forEach((link, index) => {
    if (!link.getAttribute('name')) {
      errors.push({
        line: findElementLine(xmlString, 'link', index),
        column: 1,
        message: formatMsg(t.sdfLinkMissingName, index + 1),
      });
    }
  });

  const joints = Array.from(doc.querySelectorAll('joint'));
  joints.forEach((joint, index) => {
    const line = findElementLine(xmlString, 'joint', index);
    const jointName = joint.getAttribute('name');
    const jointType = joint.getAttribute('type');

    if (!jointName) {
      errors.push({
        line,
        column: 1,
        message: formatMsg(t.sdfJointMissingName, index + 1),
      });
    }

    if (!jointType) {
      errors.push({
        line,
        column: 1,
        message: formatMsg(t.sdfJointMissingType, jointName || String(index + 1)),
      });
    } else if (!SDF_JOINT_TYPES.has(jointType)) {
      errors.push({
        line,
        column: 1,
        message: formatMsg(t.invalidSdfJointType, jointName || String(index + 1), jointType),
      });
    }

    if (!joint.querySelector('parent')) {
      errors.push({
        line,
        column: 1,
        message: formatMsg(t.sdfJointMissingParent, jointName || String(index + 1)),
      });
    }

    if (!joint.querySelector('child')) {
      errors.push({
        line,
        column: 1,
        message: formatMsg(t.sdfJointMissingChild, jointName || String(index + 1)),
      });
    }
  });

  return errors;
};

const validateMjcfDocument = (
  xmlString: string,
  texts: XmlDocumentValidationTexts,
): ValidationError[] => {
  const t = { ...defaultExtraTexts, ...texts };
  const { doc, errors } = parseXmlOrCollectErrors(xmlString, t);
  if (!doc) {
    return errors;
  }

  const mujocoRoot = doc.querySelector('mujoco');
  if (!mujocoRoot) {
    return [{ line: 1, column: 1, message: t.missingMjcfRoot }];
  }

  const hasWorldbodyChild = Array.from(mujocoRoot.children)
    .some((child) => child.tagName === 'worldbody');
  if (!hasWorldbodyChild) {
    errors.push({
      line: findElementLine(xmlString, 'mujoco', 0),
      column: 1,
      message: t.missingMjcfWorldbody,
    });
  }

  const joints = Array.from(doc.querySelectorAll('joint'));
  joints.forEach((joint, index) => {
    const type = joint.getAttribute('type');
    if (!type) {
      return;
    }
    if (!MJCF_JOINT_TYPES.has(type)) {
      errors.push({
        line: findElementLine(xmlString, 'joint', index),
        column: 1,
        message: formatMsg(t.invalidMjcfJointType, type),
      });
    }
  });

  const geoms = Array.from(doc.querySelectorAll('geom'));
  geoms.forEach((geom, index) => {
    const type = geom.getAttribute('type');
    if (!type) {
      return;
    }
    if (!MJCF_GEOM_TYPES.has(type)) {
      errors.push({
        line: findElementLine(xmlString, 'geom', index),
        column: 1,
        message: formatMsg(t.invalidMjcfGeomType, type),
      });
    }
  });

  return errors;
};

export const validateXmlDocumentByFlavor = (
  xmlString: string,
  documentFlavor: SourceCodeDocumentFlavor,
  texts: XmlDocumentValidationTexts = {},
): ValidationError[] => {
  switch (documentFlavor) {
    case 'urdf':
      return validateUrdfDocument(xmlString, texts);
    case 'xacro':
      return validateXacroDocument(xmlString, texts);
    case 'sdf':
      return validateSdfDocument(xmlString, texts);
    case 'mjcf':
    case 'equivalent-mjcf':
      return validateMjcfDocument(xmlString, texts);
    case 'usd':
    default:
      return [];
  }
};
