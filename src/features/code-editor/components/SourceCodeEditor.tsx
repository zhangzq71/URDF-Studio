/**
 * SourceCodeEditor - Unified Monaco source window for editable and read-only code.
 * Supports URDF, Xacro, MJCF, USD text, and equivalent MJCF previews in one reusable shell.
 */
import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle,
  Code,
  Copy,
  Download,
  Info,
  Loader2,
  Lock,
  Maximize,
  Minimize,
  Save,
  X,
} from 'lucide-react';
import type { Theme } from '@/types';
import type { Language } from '@/store';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import type { SourceCodeDocumentFlavor } from '../types';
import type { MonacoInstance } from '../utils/monacoLoader';
import {
  getDocumentLanguageId,
  getXmlCompletionEntries,
  isXmlLikeDocumentFlavor,
  supportsDocumentValidation,
} from '../utils/xmlLanguageSupport';
import { getUrdfValidationDebounceMs } from '../utils/editorPerformance.ts';
import { validateUrdfDocument, type ValidationError } from '../utils/urdfValidation';

export interface SourceCodeEditorProps {
  code: string;
  onCodeChange: (newCode: string) => void;
  onClose: () => void;
  theme: Theme;
  fileName?: string;
  lang?: Language;
  documentFlavor?: SourceCodeDocumentFlavor;
  readOnly?: boolean;
}

interface DocumentMeta {
  language: ReturnType<typeof getDocumentLanguageId>;
  label: string;
  supportsValidation: boolean;
  isXmlLike: boolean;
}

const editorTexts = {
  en: {
    save: 'Save',
    saveTooltip: 'Save (Ctrl+S)',
    download: 'Download',
    downloadTooltip: 'Download file',
    previewDownloadTooltip: 'Use the Export dialog to download a complete MJCF bundle',
    copy: 'Copy',
    copyTooltip: 'Copy to clipboard',
    copied: 'Copied',
    modified: 'Modified',
    readOnly: 'Read-only',
    readOnlyView: 'Read-only view',
    generated: 'Generated',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
    maximized: 'Maximized',
    noErrors: 'No errors',
    problems: 'problems',
    loading: 'Loading...',
    noStructuralValidation: 'No structural validation',
    jumpToProblem: 'Jump to first problem',
    saveShortcut: 'Ctrl+S',
    urdfLabel: 'URDF/XML',
    xacroLabel: 'Xacro/XML',
    sdfLabel: 'SDF/XML',
    mjcfLabel: 'MJCF/XML',
    usdLabel: 'USD/ASCII',
    equivalentMjcfLabel: 'Equivalent MJCF',
    xmlParseError: 'XML parsing error',
    missingRobotRoot: 'Missing <robot> root element',
    robotMissingName: '<robot> element missing name attribute',
    linkMissingName: 'Link #{0} missing name attribute',
    jointMissingName: 'Joint #{0} missing name attribute',
    jointMissingType: 'Joint "{0}" missing type attribute',
    jointMissingParent: 'Joint "{0}" missing <parent> element',
    jointMissingChild: 'Joint "{0}" missing <child> element',
    unknownElement: 'Unknown <{0}> element under <{1}>',
    unknownAttribute: '<{0}> has unknown "{1}" attribute',
    missingRequiredAttribute: '<{0}> missing required "{1}" attribute',
    invalidAttributeValue: '<{0}> attribute "{1}" has invalid value "{2}"',
    cannotParseXml: 'Cannot parse XML',
  },
  zh: {
    save: '保存',
    saveTooltip: '保存 (Ctrl+S)',
    download: '下载',
    downloadTooltip: '下载文件',
    previewDownloadTooltip: '请使用导出面板下载完整的 MJCF bundle',
    copy: '复制',
    copyTooltip: '复制到剪贴板',
    copied: '已复制',
    modified: '已修改',
    readOnly: '只读',
    readOnlyView: '只读视图',
    generated: '生成内容',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
    maximized: '最大化',
    noErrors: '无错误',
    problems: '个问题',
    loading: '加载中...',
    noStructuralValidation: '当前模式不做结构校验',
    jumpToProblem: '跳转到第一个问题',
    saveShortcut: 'Ctrl+S',
    urdfLabel: 'URDF/XML',
    xacroLabel: 'Xacro/XML',
    sdfLabel: 'SDF/XML',
    mjcfLabel: 'MJCF/XML',
    usdLabel: 'USD/ASCII',
    equivalentMjcfLabel: '等效 MJCF',
    xmlParseError: 'XML 解析错误',
    missingRobotRoot: '缺少 <robot> 根元素',
    robotMissingName: '<robot> 元素缺少 name 属性',
    linkMissingName: '第 {0} 个 <link> 缺少 name 属性',
    jointMissingName: '第 {0} 个 <joint> 缺少 name 属性',
    jointMissingType: '关节 "{0}" 缺少 type 属性',
    jointMissingParent: '关节 "{0}" 缺少 <parent> 元素',
    jointMissingChild: '关节 "{0}" 缺少 <child> 元素',
    unknownElement: '<{1}> 下存在未知元素 <{0}>',
    unknownAttribute: '<{0}> 存在未知属性 "{1}"',
    missingRequiredAttribute: '<{0}> 缺少必需属性 "{1}"',
    invalidAttributeValue: '<{0}> 的属性 "{1}" 存在非法值 "{2}"',
    cannotParseXml: '无法解析 XML',
  },
};

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const FIND_WIDGET_TOOLTIP_TARGET_SELECTOR =
  '.find-widget .button, .find-widget .monaco-custom-toggle';
const HEADER_ACTION_CLASS =
  'inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-element-hover';
const HEADER_PRIMARY_ACTION_CLASS =
  'inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors';
const MonacoEditor = React.lazy(() => import('@monaco-editor/react').then((module) => ({ default: module.default })));

const formatContentSize = (content: string): string => {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const getDownloadFileName = (
  fileName: string,
  documentFlavor: SourceCodeDocumentFlavor,
): string => {
  if (documentFlavor !== 'equivalent-mjcf') {
    return fileName;
  }

  const strippedName = fileName.replace(/\.(usd|usda|usdc|usdz)$/i, '');
  return `${strippedName}.equivalent.mjcf`;
};

const getDocumentMeta = (
  documentFlavor: SourceCodeDocumentFlavor,
  t: (typeof editorTexts)['en'],
): DocumentMeta => {
  const language = getDocumentLanguageId(documentFlavor);

  switch (documentFlavor) {
    case 'mjcf':
      return {
        language,
        label: t.mjcfLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
    case 'sdf':
      return {
        language,
        label: t.sdfLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
    case 'usd':
      return {
        language,
        label: t.usdLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
    case 'equivalent-mjcf':
      return {
        language,
        label: t.equivalentMjcfLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
    case 'xacro':
      return {
        language,
        label: t.xacroLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
    case 'urdf':
    default:
      return {
        language,
        label: t.urdfLabel,
        supportsValidation: supportsDocumentValidation(documentFlavor),
        isXmlLike: isXmlLikeDocumentFlavor(documentFlavor),
      };
  }
};

const attachFindWidgetTooltipSuppression = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: { getDomNode: () => any },
) => {
  const editorDomNode = editor.getDomNode();
  if (!(editorDomNode instanceof HTMLElement)) {
    return () => undefined;
  }

  const handleMouseOverCapture = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest(FIND_WIDGET_TOOLTIP_TARGET_SELECTOR)) {
      event.stopPropagation();
    }
  };

  editorDomNode.addEventListener('mouseover', handleMouseOverCapture, true);

  return () => {
    editorDomNode.removeEventListener('mouseover', handleMouseOverCapture, true);
  };
};

const getDocumentValidationErrors = (
  code: string,
  documentFlavor: SourceCodeDocumentFlavor,
  t: (typeof editorTexts)['en'],
): ValidationError[] => {
  if (documentFlavor !== 'urdf') {
    return [];
  }

  return validateUrdfDocument(code, t);
};

export const SourceCodeEditor: React.FC<SourceCodeEditorProps> = ({
  code,
  onCodeChange,
  onClose,
  theme,
  fileName = 'robot.urdf',
  lang = 'en',
  documentFlavor = 'urdf',
  readOnly = false,
}) => {
  const t = editorTexts[lang];
  const isEquivalentMjcfPreview = documentFlavor === 'equivalent-mjcf';
  const isReadOnly = readOnly || documentFlavor === 'equivalent-mjcf';
  const documentMeta = useMemo(
    () => getDocumentMeta(documentFlavor, t),
    [documentFlavor, t],
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    () => getDocumentValidationErrors(code, documentFlavor, t),
  );
  const [currentCode, setCurrentCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const editorMountVersionRef = useRef(0);
  const [monacoInstance, setMonacoInstance] = useState<MonacoInstance | null>(null);

  const windowState = useDraggableWindow({
    defaultPosition: { x: 100, y: 100 },
    defaultSize: { width: 800, height: 600 },
    minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
    centerOnMount: false,
    enableMinimize: false,
    clampResizeToViewport: false,
    dragBounds: {
      allowNegativeX: true,
      minVisibleWidth: 100,
      bottomMargin: 50,
    },
  });

  const { isMaximized, size, toggleMaximize } = windowState;

  const contentSizeLabel = useMemo(() => formatContentSize(currentCode), [currentCode]);

  useEffect(() => {
    return () => {
      editorMountVersionRef.current += 1;
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && code !== currentCode && !isDirty) {
      editorRef.current.setValue(code);
      setCurrentCode(code);
    }
  }, [code, currentCode, documentFlavor, isDirty, t]);

  useEffect(() => {
    if (!documentMeta.supportsValidation) {
      setValidationErrors([]);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      const nextErrors = getDocumentValidationErrors(currentCode, documentFlavor, t);
      startTransition(() => {
        setValidationErrors(nextErrors);
      });
    }, getUrdfValidationDebounceMs(currentCode.length));

    return () => window.clearTimeout(timeout);
  }, [currentCode, documentFlavor, documentMeta.supportsValidation, t]);

  useEffect(() => {
    if (
      !monacoInstance
      || (documentMeta.language !== 'urdf' && documentMeta.language !== 'xacro')
    ) {
      return undefined;
    }

    const completionItemKind = monacoInstance.languages.CompletionItemKind;
    const completionKindMap = {
      tag: completionItemKind.Keyword,
      attribute: completionItemKind.Property,
      value: completionItemKind.EnumMember,
      snippet: completionItemKind.Snippet,
    } as const;

    const disposable = monacoInstance.languages.registerCompletionItemProvider(documentMeta.language, {
      triggerCharacters: ['<', ' ', ':', '"'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems: (model: any, position: any) => {
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const entries = getXmlCompletionEntries(documentFlavor, textBeforeCursor);

        if (entries.length === 0) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: entries.map((entry) => ({
            label: entry.label,
            kind: completionKindMap[entry.kind],
            insertText: entry.insertText,
            insertTextRules: entry.insertAsSnippet
              ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            documentation: entry.documentation,
            range,
          })),
        };
      },
    });

    return () => disposable.dispose();
  }, [documentFlavor, documentMeta.language, monacoInstance]);

  useEffect(() => {
    if (!monacoInstance || !editorRef.current) {
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }

    monacoInstance.editor.setModelLanguage(model, documentMeta.language);
  }, [documentMeta.language, monacoInstance]);

  useEffect(() => {
    if (!monacoInstance || !editorRef.current) {
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }

    const markers = documentMeta.supportsValidation
      ? validationErrors.map((error) => ({
          severity: monacoInstance.MarkerSeverity.Error,
          startLineNumber: error.line,
          startColumn: error.column || 1,
          endLineNumber: error.endLine || error.line,
          endColumn: error.endColumn || error.column || 1,
          message: error.message,
          source: 'URDF Validator',
        }))
      : [];

    monacoInstance.editor.setModelMarkers(model, 'urdf-validator', markers);
  }, [documentMeta.supportsValidation, monacoInstance, validationErrors]);

  const handleApply = useCallback(() => {
    if (isReadOnly || !editorRef.current) {
      return;
    }

    const value = editorRef.current.getValue();
    const nextValidationErrors = getDocumentValidationErrors(value, documentFlavor, t);
    if (nextValidationErrors.length > 0) {
      setValidationErrors(nextValidationErrors);
    }

    onCodeChange(value);
    setIsDirty(false);
  }, [documentFlavor, isReadOnly, onCodeChange, t]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) {
        return;
      }

      setCurrentCode(value);
      setIsDirty(isReadOnly ? false : value !== code);
    },
    [code, isReadOnly],
  );

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(currentCode);
    setCopied(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
  }, [currentCode]);

  const handleDownload = useCallback(() => {
    if (isEquivalentMjcfPreview) {
      return;
    }
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getDownloadFileName(fileName, documentFlavor);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [currentCode, documentFlavor, fileName, isEquivalentMjcfPreview]);

  useEffect(() => {
    if (isReadOnly) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isDirty) {
          handleApply();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleApply, isDirty, isReadOnly]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => cancelAnimationFrame(id);
  }, [isMaximized, size.height, size.width]);

  useEffect(() => {
    if (!isEditorReady || !editorRef.current) {
      return undefined;
    }

    return attachFindWidgetTooltipSuppression(editorRef.current);
  }, [isEditorReady]);

  const handleEditorMount = useCallback((editor: unknown, monaco: MonacoInstance) => {
    const mountVersion = editorMountVersionRef.current + 1;
    editorMountVersionRef.current = mountVersion;
    editorRef.current = editor;

    void import('../utils/monacoLoader')
      .then(({ ensureSourceCodeEditorLanguages }) => {
        if (editorMountVersionRef.current !== mountVersion || editorRef.current !== editor) {
          return;
        }

        setMonacoInstance(ensureSourceCodeEditorLanguages(monaco));
        setIsEditorReady(true);
        requestAnimationFrame(() => {
          if (editorMountVersionRef.current === mountVersion && editorRef.current) {
            editorRef.current.layout();
          }
        });
      })
      .catch((error) => {
        console.error('Failed to initialize Monaco editor languages:', error);

        if (editorMountVersionRef.current !== mountVersion || editorRef.current !== editor) {
          return;
        }

        setMonacoInstance(monaco);
        setIsEditorReady(true);
        requestAnimationFrame(() => {
          if (editorMountVersionRef.current === mountVersion && editorRef.current) {
            editorRef.current.layout();
          }
        });
      });
  }, []);

  return (
    <DraggableWindow
      window={windowState}
      onClose={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap">
          <div className="flex items-center gap-1.5 opacity-80">
            <Code className="h-4 w-4 text-system-blue" />
            <span className="truncate font-mono text-xs font-semibold tracking-tight text-text-primary">
              {fileName}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-text-tertiary">{contentSizeLabel}</span>
          {isReadOnly ? (
            <span className="shrink-0 rounded bg-element-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
              {t.readOnly}
            </span>
          ) : null}
          {documentFlavor === 'equivalent-mjcf' ? (
            <span className="shrink-0 rounded bg-system-blue/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-system-blue">
              {t.generated}
            </span>
          ) : null}
          {!isReadOnly && isDirty ? (
            <span className="shrink-0 rounded bg-amber-500/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              {t.modified}
            </span>
          ) : null}
        </div>
      }
      headerActions={
        <div className="flex items-center gap-1">
          {!isReadOnly ? (
            <button
              onClick={handleApply}
              disabled={!isDirty}
              className={`${HEADER_PRIMARY_ACTION_CLASS} ${
                isDirty
                  ? 'bg-system-blue-solid text-white hover:bg-system-blue-hover'
                  : 'cursor-not-allowed bg-transparent text-text-tertiary'
              }`}
              title={t.saveTooltip}
              type="button"
            >
              <Save className="h-3 w-3" />
              <span>{t.save}</span>
            </button>
          ) : null}
          <button
            onClick={handleDownload}
            className={`${HEADER_ACTION_CLASS} ${
              isEquivalentMjcfPreview ? 'cursor-not-allowed opacity-60' : ''
            }`}
            title={isEquivalentMjcfPreview ? t.previewDownloadTooltip : t.downloadTooltip}
            disabled={isEquivalentMjcfPreview}
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t.download}</span>
          </button>
          <button
            onClick={handleCopy}
            className={`${HEADER_ACTION_CLASS} ${
              copied ? 'bg-element-hover text-system-blue' : ''
            }`}
            title={t.copyTooltip}
            type="button"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? t.copied : t.copy}</span>
          </button>
        </div>
      }
      className={`fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border-black bg-panel-bg text-text-primary shadow-2xl ${
        isMaximized ? 'inset-0 !h-full !w-full !transform-none rounded-none' : ''
      }`}
      headerClassName="flex h-10 items-center justify-between gap-3 border-b border-border-black bg-element-bg px-3 select-none"
      headerLeftClassName="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden"
      headerRightClassName="flex shrink-0 items-center gap-1"
      headerDraggableClassName="cursor-move"
      headerDraggingClassName="cursor-move"
      showMinimizeButton={false}
      maximizeTitle={t.maximize}
      restoreTitle={t.restore}
      closeTitle={t.close}
      onHeaderDoubleClick={toggleMaximize}
      controlButtonClassName="rounded p-1.5 text-text-tertiary transition-colors hover:bg-element-hover"
      closeButtonClassName="rounded p-1.5 text-text-tertiary transition-colors hover:bg-danger hover:text-white"
      rightResizeHandleClassName="absolute right-0 top-10 bottom-7 z-40 w-1.5 cursor-ew-resize transition-colors hover:bg-system-blue/30"
      bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 z-40 h-1.5 cursor-ns-resize transition-colors hover:bg-system-blue/30"
      cornerResizeHandleClassName="absolute bottom-0 right-0 z-50 h-4 w-4 cursor-nwse-resize transition-colors hover:bg-system-blue/40"
      rightResizeDirection="e"
      bottomResizeDirection="s"
      cornerResizeDirection="se"
      controlIcons={{
        maximize: <Maximize className="h-3.5 w-3.5" />,
        restore: <Minimize className="h-3.5 w-3.5" />,
        close: <X className="h-4 w-4" />,
      }}
    >
      <div className="relative flex-1 overflow-hidden">
        {!isEditorReady ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel-bg">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
              <span>{t.loading}</span>
            </div>
          </div>
        ) : null}

        <Suspense fallback={null}>
          <MonacoEditor
            height="100%"
            defaultLanguage={documentMeta.language}
            defaultValue={code}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: false,
              tabSize: 2,
              formatOnPaste: !isReadOnly && documentMeta.isXmlLike,
              formatOnType: !isReadOnly && documentMeta.isXmlLike,
              lineNumbersMinChars: 4,
              padding: { top: 12, bottom: 14 },
              renderLineHighlight: 'all',
              readOnly: isReadOnly,
              domReadOnly: isReadOnly,
              glyphMargin: documentMeta.supportsValidation,
              renderValidationDecorations: documentMeta.supportsValidation ? 'editable' : 'off',
            }}
          />
        </Suspense>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-border-black bg-element-bg px-3 text-[10px] select-none">
        <div className="flex items-center gap-3">
          {documentMeta.supportsValidation ? (
            validationErrors.length > 0 ? (
              <button
                className="flex items-center gap-1.5 text-amber-600 transition-colors hover:text-amber-500 dark:text-amber-400"
                onClick={() => {
                  const firstError = validationErrors[0];
                  if (!editorRef.current || !firstError) {
                    return;
                  }

                  editorRef.current.revealLineInCenter(firstError.line);
                  editorRef.current.setPosition({
                    lineNumber: firstError.line,
                    column: firstError.column || 1,
                  });
                  editorRef.current.focus();
                }}
                title={t.jumpToProblem}
                type="button"
              >
                <AlertCircle className="h-3 w-3" />
                <span>
                  {validationErrors.length} {t.problems}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-success dark:text-success">
                <CheckCircle className="h-3 w-3" />
                <span>{t.noErrors}</span>
              </div>
            )
          ) : (
            <div className="flex items-center gap-1.5 text-text-secondary">
              {isReadOnly ? <Lock className="h-3 w-3" /> : <Info className="h-3 w-3" />}
              <span>{isReadOnly ? t.readOnlyView : t.noStructuralValidation}</span>
            </div>
          )}

          {isReadOnly ? (
            <>
              <div className="h-3 w-px bg-border-black" />
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span>{t.readOnly}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2 font-mono text-text-tertiary">
          {!isReadOnly ? (
            <>
              <span>{t.saveShortcut}</span>
              <span aria-hidden="true">•</span>
            </>
          ) : null}
          <span>{documentMeta.label}</span>
          <span aria-hidden="true">•</span>
          <span>{isMaximized ? t.maximized : `${Math.round(size.width)} × ${Math.round(size.height)}`}</span>
        </div>
      </div>
    </DraggableWindow>
  );
};
