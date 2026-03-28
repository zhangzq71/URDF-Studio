import type {
  SourceCodeDocumentFlavor,
  SourceCodeEditorLanguageId,
  XmlCompletionEntry,
} from '../types';
import {
  getAllUrdfAttributeNames,
  getAllUrdfElementNames,
  getUrdfAttributesForElement,
  getUrdfEnumValuesForAttribute,
  getUrdfRootSchema,
  getUrdfSchemaNodeByType,
  resolveUrdfChildSchemaType,
} from './urdfSchema.ts';

const XACRO_TAGS = [
  'xacro:macro',
  'xacro:property',
  'xacro:include',
  'xacro:arg',
  'xacro:if',
  'xacro:unless',
  'xacro:insert_block',
];

const XACRO_ATTRIBUTES = [
  'name',
  'value',
  'default',
  'params',
  'filename',
  'ns',
];

const URDF_SNIPPETS: XmlCompletionEntry[] = [
  {
    label: 'link-snippet',
    kind: 'snippet',
    insertText:
      '<link name="${1:link_name}">\n\t<visual>\n\t\t<origin xyz="${2:0 0 0}" rpy="${3:0 0 0}"/>\n\t\t<geometry>\n\t\t\t<box size="${4:0.1 0.1 0.1}"/>\n\t\t</geometry>\n\t</visual>\n</link>',
    documentation: 'Basic URDF link structure',
    insertAsSnippet: true,
  },
  {
    label: 'joint-snippet',
    kind: 'snippet',
    insertText:
      '<joint name="${1:joint_name}" type="${2:revolute}">\n\t<parent link="${3:parent_link}"/>\n\t<child link="${4:child_link}"/>\n\t<origin xyz="${5:0 0 0}" rpy="${6:0 0 0}"/>\n\t<axis xyz="${7:0 0 1}"/>\n\t<limit lower="${8:-1.57}" upper="${9:1.57}" effort="${10:100}" velocity="${11:1}"/>\n</joint>',
    documentation: 'Basic URDF joint structure',
    insertAsSnippet: true,
  },
];

const XACRO_SNIPPETS: XmlCompletionEntry[] = [
  {
    label: 'macro-snippet',
    kind: 'snippet',
    insertText:
      '<xacro:macro name="${1:macro_name}" params="${2:param}">\n\t${3}\n</xacro:macro>',
    documentation: 'Define a reusable Xacro macro',
    insertAsSnippet: true,
  },
  {
    label: 'property-snippet',
    kind: 'snippet',
    insertText: '<xacro:property name="${1:property_name}" value="${2:value}" />',
    documentation: 'Define a reusable Xacro property',
    insertAsSnippet: true,
  },
  {
    label: 'include-snippet',
    kind: 'snippet',
    insertText: '<xacro:include filename="${1:$(find package)/urdf/file.xacro}" />',
    documentation: 'Include another Xacro file',
    insertAsSnippet: true,
  },
];

const buildKeywordEntries = (
  labels: string[],
  kind: XmlCompletionEntry['kind'],
): XmlCompletionEntry[] => labels.map((label) => ({ label, kind, insertText: label }));

const uniqueSorted = <T>(values: T[]): T[] => Array.from(new Set(values)).sort();

const EMPTY_ENTRIES: XmlCompletionEntry[] = [];
const URDF_ROOT_TYPE_NAME = getUrdfRootSchema().typeName;
const ROOT_TAG_ENTRIES = buildKeywordEntries(['robot'], 'tag');
const URDF_TAG_ENTRIES = buildKeywordEntries(getAllUrdfElementNames(), 'tag');
const URDF_ATTRIBUTE_ENTRIES = buildKeywordEntries(getAllUrdfAttributeNames(), 'attribute');
const XACRO_TAG_ENTRIES = buildKeywordEntries(XACRO_TAGS, 'tag');
const XACRO_ATTRIBUTE_ENTRIES = buildKeywordEntries(XACRO_ATTRIBUTES, 'attribute');
const scopedAttributeEntriesCache = new Map<string, XmlCompletionEntry[]>();
const scopedAttributeValueEntriesCache = new Map<string, XmlCompletionEntry[]>();
const scopedTagEntriesCache = new Map<string, XmlCompletionEntry[]>();

const XML_TAG_CONTEXT_PATTERN = /<\/?[\w:.-]*$/i;
const XML_ATTRIBUTE_CONTEXT_PATTERN = /<[\w:.-]+(?:\s+[\w:.-]+(?:=(?:"[^"]*"|'[^']*'))?)*\s+[\w:.-]*$/i;
const XML_ATTRIBUTE_VALUE_CONTEXT_PATTERN = /<([\w:.-]+)\b[^>]*\b([\w:.-]+)\s*=\s*["'][^"']*$/i;
const XML_OPEN_TAG_NAME_CONTEXT_PATTERN = /<([\w:.-]+)(?=[^<>]*$)/i;

interface ParsedXmlElement {
  elementName: string;
  schemaTypeName: string | null;
}

type XmlTagScope =
  | { kind: 'root' }
  | { kind: 'known'; schemaTypeName: string }
  | { kind: 'unknown' };

const URDF_TAG_ENTRIES_WITH_SNIPPETS = [...URDF_TAG_ENTRIES, ...URDF_SNIPPETS];
const XACRO_TAG_ENTRIES_WITH_SNIPPETS = [
  ...URDF_TAG_ENTRIES,
  ...XACRO_TAG_ENTRIES,
  ...URDF_SNIPPETS,
  ...XACRO_SNIPPETS,
];
const XACRO_ROOT_TAG_ENTRIES = [...ROOT_TAG_ENTRIES, ...XACRO_TAG_ENTRIES, ...XACRO_SNIPPETS];

const getUrdfSnippetEntriesForChildTags = (childTagNames: string[]): XmlCompletionEntry[] => {
  const entries: XmlCompletionEntry[] = [];

  if (childTagNames.includes('link')) {
    entries.push(URDF_SNIPPETS[0]);
  }

  if (childTagNames.includes('joint')) {
    entries.push(URDF_SNIPPETS[1]);
  }

  return entries;
};

const getFallbackTagEntries = (
  documentFlavor: SourceCodeDocumentFlavor,
): XmlCompletionEntry[] => (
  documentFlavor === 'xacro' ? XACRO_TAG_ENTRIES_WITH_SNIPPETS : URDF_TAG_ENTRIES_WITH_SNIPPETS
);

const getRootTagEntries = (
  documentFlavor: SourceCodeDocumentFlavor,
): XmlCompletionEntry[] => (
  documentFlavor === 'xacro' ? XACRO_ROOT_TAG_ENTRIES : ROOT_TAG_ENTRIES
);

const getScopedTagEntries = (
  documentFlavor: SourceCodeDocumentFlavor,
  scope: XmlTagScope,
): XmlCompletionEntry[] => {
  const cacheKey = scope.kind === 'known'
    ? `${documentFlavor}:schema:${scope.schemaTypeName}`
    : `${documentFlavor}:${scope.kind}`;
  const cached = scopedTagEntriesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let entries: XmlCompletionEntry[];

  if (scope.kind === 'root') {
    entries = getRootTagEntries(documentFlavor);
  } else if (scope.kind === 'unknown') {
    entries = getFallbackTagEntries(documentFlavor);
  } else {
    const schemaNode = getUrdfSchemaNodeByType(scope.schemaTypeName);
    if (!schemaNode || schemaNode.allowAnyChildren) {
      entries = getFallbackTagEntries(documentFlavor);
    } else {
      const childTagNames = uniqueSorted(schemaNode.children.map((child) => child.name));
      const tagEntries = buildKeywordEntries(childTagNames, 'tag');
      const urdfSnippetEntries = getUrdfSnippetEntriesForChildTags(childTagNames);

      entries = documentFlavor === 'xacro'
        ? [...tagEntries, ...XACRO_TAG_ENTRIES, ...urdfSnippetEntries, ...XACRO_SNIPPETS]
        : [...tagEntries, ...urdfSnippetEntries];
    }
  }

  scopedTagEntriesCache.set(cacheKey, entries);
  return entries;
};

const findTagEnd = (text: string, startIndex: number): number => {
  let quoteCharacter: '"' | '\'' | null = null;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (quoteCharacter) {
      if (character === quoteCharacter) {
        quoteCharacter = null;
      }
      continue;
    }

    if (character === '"' || character === '\'') {
      quoteCharacter = character;
      continue;
    }

    if (character === '>') {
      return index;
    }
  }

  return -1;
};

const readTagName = (text: string, startIndex: number): {
  tagName: string | null;
  nextIndex: number;
} => {
  let index = startIndex;

  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }

  const nameStart = index;
  while (index < text.length && /[\w:.-]/.test(text[index])) {
    index += 1;
  }

  if (index === nameStart) {
    return { tagName: null, nextIndex: index };
  }

  return { tagName: text.slice(nameStart, index), nextIndex: index };
};

const isSelfClosingTag = (text: string, tagStartIndex: number, tagEndIndex: number): boolean => {
  let index = tagEndIndex - 1;

  while (index > tagStartIndex && /\s/.test(text[index])) {
    index -= 1;
  }

  return text[index] === '/';
};

const resolveChildSchemaTypeFromStack = (
  stack: ParsedXmlElement[],
  childElementName: string,
): string | null => {
  if (stack.length === 0) {
    return childElementName === 'robot' ? URDF_ROOT_TYPE_NAME : null;
  }

  const parentSchemaTypeName = stack[stack.length - 1]?.schemaTypeName;
  if (!parentSchemaTypeName) {
    return null;
  }

  return resolveUrdfChildSchemaType(parentSchemaTypeName, childElementName);
};

const parseXmlElementStack = (textBeforeCursor: string): ParsedXmlElement[] => {
  const stack: ParsedXmlElement[] = [];
  let index = 0;

  while (index < textBeforeCursor.length) {
    if (textBeforeCursor[index] !== '<') {
      index += 1;
      continue;
    }

    if (textBeforeCursor.startsWith('<!--', index)) {
      const commentEnd = textBeforeCursor.indexOf('-->', index + 4);
      if (commentEnd === -1) {
        break;
      }
      index = commentEnd + 3;
      continue;
    }

    if (textBeforeCursor.startsWith('<![CDATA[', index)) {
      const cdataEnd = textBeforeCursor.indexOf(']]>', index + 9);
      if (cdataEnd === -1) {
        break;
      }
      index = cdataEnd + 3;
      continue;
    }

    if (textBeforeCursor.startsWith('<?', index)) {
      const declarationEnd = textBeforeCursor.indexOf('?>', index + 2);
      if (declarationEnd === -1) {
        break;
      }
      index = declarationEnd + 2;
      continue;
    }

    if (textBeforeCursor.startsWith('</', index)) {
      const { tagName, nextIndex } = readTagName(textBeforeCursor, index + 2);
      if (!tagName) {
        index += 1;
        continue;
      }

      const tagEnd = findTagEnd(textBeforeCursor, nextIndex);
      if (tagEnd === -1) {
        break;
      }

      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        if (stack[stackIndex].elementName === tagName) {
          stack.length = stackIndex;
          break;
        }
      }

      index = tagEnd + 1;
      continue;
    }

    if (textBeforeCursor.startsWith('<!', index)) {
      const specialTagEnd = findTagEnd(textBeforeCursor, index + 2);
      if (specialTagEnd === -1) {
        break;
      }
      index = specialTagEnd + 1;
      continue;
    }

    const { tagName, nextIndex } = readTagName(textBeforeCursor, index + 1);
    if (!tagName) {
      index += 1;
      continue;
    }

    const tagEnd = findTagEnd(textBeforeCursor, nextIndex);
    if (tagEnd === -1) {
      break;
    }

    if (!isSelfClosingTag(textBeforeCursor, index, tagEnd)) {
      stack.push({
        elementName: tagName,
        schemaTypeName: resolveChildSchemaTypeFromStack(stack, tagName),
      });
    }

    index = tagEnd + 1;
  }

  return stack;
};

const getTagScope = (textBeforeCursor: string): XmlTagScope => {
  const stack = parseXmlElementStack(textBeforeCursor);
  const currentParent = stack[stack.length - 1];

  if (!currentParent) {
    return { kind: 'root' };
  }

  if (!currentParent.schemaTypeName) {
    return { kind: 'unknown' };
  }

  return { kind: 'known', schemaTypeName: currentParent.schemaTypeName };
};

const getScopedAttributeEntries = (
  documentFlavor: SourceCodeDocumentFlavor,
  elementName: string | null,
): XmlCompletionEntry[] => {
  const cacheKey = `${documentFlavor}:${elementName || '*'}`;
  const cached = scopedAttributeEntriesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const urdfAttributeEntries = elementName
    ? buildKeywordEntries(
        getUrdfAttributesForElement(elementName).map((attribute) => attribute.name),
        'attribute',
      )
    : URDF_ATTRIBUTE_ENTRIES;

  const entries = documentFlavor === 'xacro'
    ? [...urdfAttributeEntries, ...XACRO_ATTRIBUTE_ENTRIES]
    : urdfAttributeEntries;

  scopedAttributeEntriesCache.set(cacheKey, entries);
  return entries;
};

const getScopedAttributeValueEntries = (
  elementName: string,
  attributeName: string,
): XmlCompletionEntry[] => {
  const cacheKey = `${elementName}:${attributeName}`;
  const cached = scopedAttributeValueEntriesCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const entries = buildKeywordEntries(
    getUrdfEnumValuesForAttribute(elementName, attributeName),
    'value',
  );
  scopedAttributeValueEntriesCache.set(cacheKey, entries);
  return entries;
};

export const getDocumentLanguageId = (
  documentFlavor: SourceCodeDocumentFlavor,
): SourceCodeEditorLanguageId => {
  switch (documentFlavor) {
    case 'urdf':
      return 'urdf';
    case 'xacro':
      return 'xacro';
    case 'usd':
      return 'plaintext';
    case 'sdf':
    case 'mjcf':
    case 'equivalent-mjcf':
    default:
      return 'xml';
  }
};

export const supportsDocumentValidation = (
  documentFlavor: SourceCodeDocumentFlavor,
): boolean => documentFlavor === 'urdf';

export const isXmlLikeDocumentFlavor = (
  documentFlavor: SourceCodeDocumentFlavor,
): boolean => getDocumentLanguageId(documentFlavor) !== 'plaintext';

export const getXmlCompletionEntries = (
  documentFlavor: SourceCodeDocumentFlavor,
  textBeforeCursor: string,
): XmlCompletionEntry[] => {
  if (documentFlavor !== 'urdf' && documentFlavor !== 'xacro') {
    return [];
  }

  const attributeValueMatch = textBeforeCursor.match(XML_ATTRIBUTE_VALUE_CONTEXT_PATTERN);
  if (attributeValueMatch) {
    return getScopedAttributeValueEntries(attributeValueMatch[1], attributeValueMatch[2]);
  }

  if (XML_ATTRIBUTE_CONTEXT_PATTERN.test(textBeforeCursor)) {
    const openTagMatch = textBeforeCursor.match(XML_OPEN_TAG_NAME_CONTEXT_PATTERN);
    return getScopedAttributeEntries(documentFlavor, openTagMatch?.[1] || null);
  }

  if (XML_TAG_CONTEXT_PATTERN.test(textBeforeCursor)) {
    return getScopedTagEntries(documentFlavor, getTagScope(textBeforeCursor));
  }

  return EMPTY_ENTRIES;
};
