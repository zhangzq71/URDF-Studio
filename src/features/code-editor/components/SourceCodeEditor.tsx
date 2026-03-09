/**
 * SourceCodeEditor - Monaco-based URDF/XML code editor
 * Features: syntax highlighting, URDF validation, auto-completion, resizable window
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { X, Save, Code, Loader2, Maximize, Minimize, AlertCircle, CheckCircle } from 'lucide-react';
import type { Theme } from '@/types';
import type { Language } from '@/store';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';

// Configure Monaco to use local resources instead of CDN
loader.config({
  paths: {
    vs: '/monaco-editor/min/vs'
  },
  // Force English UI strings for Monaco internals to avoid locale-pack load failures
  // when we only ship a minimal Monaco asset set.
  'vs/nls': {
    availableLanguages: {
      '*': 'en'
    }
  },
});

type MonacoInstance = Awaited<ReturnType<typeof loader.init>>;
let monacoPreloadPromise: Promise<MonacoInstance | null> | null = null;

export const preloadSourceCodeEditor = (): Promise<MonacoInstance | null> => {
  if (!monacoPreloadPromise) {
    monacoPreloadPromise = loader.init().catch((error) => {
      if (error?.type !== 'cancelation') {
        console.error('Monaco preload failed:', error);
      }
      monacoPreloadPromise = null;
      return null;
    });
  }

  return monacoPreloadPromise;
};

export interface SourceCodeEditorProps {
  code: string;
  onCodeChange: (newCode: string) => void;
  onClose: () => void;
  theme: Theme;
  fileName?: string;
  lang?: Language;
}

interface ValidationError {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
}

// i18n texts for source code editor
const editorTexts = {
  en: {
    save: 'Save',
    saveTooltip: 'Save (Ctrl+S)',
    modified: 'Modified',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
    maximized: 'Maximized',
    noErrors: 'No errors',
    problems: 'problems',
    loading: 'Loading...',
    // Validation messages
    xmlParseError: 'XML parsing error',
    missingRobotRoot: 'Missing <robot> root element',
    robotMissingName: '<robot> element missing name attribute',
    linkMissingName: 'Link #{0} missing name attribute',
    jointMissingName: 'Joint #{0} missing name attribute',
    jointMissingType: 'Joint "{0}" missing type attribute',
    jointMissingParent: 'Joint "{0}" missing <parent> element',
    jointMissingChild: 'Joint "{0}" missing <child> element',
    cannotParseXml: 'Cannot parse XML',
  },
  zh: {
    save: '保存',
    saveTooltip: '保存 (Ctrl+S)',
    modified: '已修改',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
    maximized: '最大化',
    noErrors: '无错误',
    problems: '个问题',
    loading: '加载中...',
    // Validation messages
    xmlParseError: 'XML 解析错误',
    missingRobotRoot: '缺少 <robot> 根元素',
    robotMissingName: '<robot> 元素缺少 name 属性',
    linkMissingName: '第 {0} 个 <link> 缺少 name 属性',
    jointMissingName: '第 {0} 个 <joint> 缺少 name 属性',
    jointMissingType: '关节 "{0}" 缺少 type 属性',
    jointMissingParent: '关节 "{0}" 缺少 <parent> 元素',
    jointMissingChild: '关节 "{0}" 缺少 <child> 元素',
    cannotParseXml: '无法解析 XML',
  }
};

// Helper to format message with parameters
const formatMsg = (msg: string, ...args: (string | number)[]): string => {
  let result = msg;
  args.forEach((arg, i) => {
    result = result.replace(`{${i}}`, String(arg));
  });
  return result;
};

const URDF_TAGS = [
  'robot', 'link', 'joint', 'type', 'name',
  'visual', 'geometry', 'box', 'cylinder', 'sphere', 'mesh',
  'collision', 'inertial', 'mass', 'inertia',
  'origin', 'xyz', 'rpy',
  'parent', 'child', 'axis', 'limit', 'lower', 'upper', 'effort', 'velocity',
  'dynamics', 'damping', 'friction',
  'material', 'color', 'texture', 'rgba'
];

const URDF_SNIPPETS = {
  link: '<link name="${1:link_name}">\n\t<visual>\n\t\t<geometry>\n\t\t\t<box size="${2:0.1 0.1 0.1}"/>\n\t\t</geometry>\n\t</visual>\n</link>',
  joint: '<joint name="${1:joint_name}" type="${2:revolute}">\n\t<parent link="${3:parent_link}"/>\n\t<child link="${4:child_link}"/>\n\t<origin xyz="0 0 0" rpy="0 0 0"/>\n\t<axis xyz="0 0 1"/>\n\t<limit lower="-1.57" upper="1.57" effort="100" velocity="1"/>\n</joint>'
};

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

// Find line number of an element in XML string
const findElementLine = (xmlString: string, tagName: string, index: number): number => {
  const lines = xmlString.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const regex = new RegExp(`<${tagName}[\\s>]`, 'g');
    const matches = lines[i].match(regex);
    if (matches) {
      count += matches.length;
      if (count > index) {
        return i + 1; // 1-indexed
      }
    }
  }
  return 1;
};

// Validate URDF XML structure
const validateURDF = (xmlString: string, t: typeof editorTexts['en']): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check for basic XML validity
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      const errorText = parseError.textContent || 'XML parsing error';
      // Try to extract line number from error message
      const lineMatch = errorText.match(/line\s*(\d+)/i);
      const line = lineMatch ? parseInt(lineMatch[1]) : 1;
      const colMatch = errorText.match(/column\s*(\d+)/i);
      const column = colMatch ? parseInt(colMatch[1]) : 1;
      errors.push({ line, column, message: t.xmlParseError + ': ' + errorText.split('\n')[0].substring(0, 100) });
      return errors;
    }

    // Check for robot root element
    const robot = doc.querySelector('robot');
    if (!robot) {
      errors.push({ line: 1, column: 1, message: t.missingRobotRoot });
      return errors;
    }

    // Check robot name
    if (!robot.getAttribute('name')) {
      const line = findElementLine(xmlString, 'robot', 0);
      errors.push({ line, column: 1, message: t.robotMissingName });
    }

    // Check links have names
    const links = doc.querySelectorAll('link');
    links.forEach((link, idx) => {
      if (!link.getAttribute('name')) {
        const line = findElementLine(xmlString, 'link', idx);
        errors.push({ line, column: 1, message: formatMsg(t.linkMissingName, idx + 1) });
      }
    });

    // Check joints have required attributes
    const joints = doc.querySelectorAll('joint');
    joints.forEach((joint, idx) => {
      const name = joint.getAttribute('name');
      const type = joint.getAttribute('type');
      const line = findElementLine(xmlString, 'joint', idx);

      if (!name) {
        errors.push({ line, column: 1, message: formatMsg(t.jointMissingName, idx + 1) });
      }
      if (!type) {
        errors.push({ line, column: 1, message: formatMsg(t.jointMissingType, name || String(idx + 1)) });
      }
      if (!joint.querySelector('parent')) {
        errors.push({ line, column: 1, message: formatMsg(t.jointMissingParent, name || String(idx + 1)) });
      }
      if (!joint.querySelector('child')) {
        errors.push({ line, column: 1, message: formatMsg(t.jointMissingChild, name || String(idx + 1)) });
      }
    });

  } catch (e) {
    errors.push({ line: 1, column: 1, message: t.cannotParseXml });
  }

  return errors;
};

export const SourceCodeEditor: React.FC<SourceCodeEditorProps> = ({
  code,
  onCodeChange,
  onClose,
  theme,
  fileName = 'robot.urdf',
  lang = 'en'
}) => {
  const t = editorTexts[lang];
  const [isDirty, setIsDirty] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [currentCode, setCurrentCode] = useState(code);

  // Sync editor content when code prop changes (e.g., different file selected)
  useEffect(() => {
    if (editorRef.current && code !== currentCode && !isDirty) {
      editorRef.current.setValue(code);
      setCurrentCode(code);
      setValidationErrors(validateURDF(code, t));
    }
  }, [code]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
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
  const {
    isMaximized,
    size,
    toggleMaximize,
  } = windowState;

  // Initialize Monaco (avoid unhandled cancellation errors)
  useEffect(() => {
    let isMounted = true;
    preloadSourceCodeEditor().then((monaco) => {
      if (isMounted && monaco) {
        setMonacoInstance(monaco);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Setup URDF completion
  useEffect(() => {
    if (monacoInstance) {
      const disposable = monacoInstance.languages.registerCompletionItemProvider('xml', {
        triggerCharacters: ['<'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = [
            ...URDF_TAGS.map(tag => ({
              label: tag,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              insertText: tag,
              range,
            })),
            {
              label: 'link-snippet',
              kind: monacoInstance.languages.CompletionItemKind.Snippet,
              insertText: URDF_SNIPPETS.link,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Basic URDF Link structure',
              range,
            },
            {
              label: 'joint-snippet',
              kind: monacoInstance.languages.CompletionItemKind.Snippet,
              insertText: URDF_SNIPPETS.joint,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Basic URDF Joint structure',
              range,
            }
          ];

          return { suggestions };
        }
      });

      return () => disposable.dispose();
    }
  }, [monacoInstance]);

  // Update Monaco markers when validation errors change
  useEffect(() => {
    if (monacoInstance && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = validationErrors.map(err => ({
          severity: monacoInstance.MarkerSeverity.Error,
          startLineNumber: err.line,
          startColumn: err.column || 1,
          endLineNumber: err.endLine || err.line,
          endColumn: err.endColumn || err.column || 1,
          message: err.message,
          source: 'URDF Validator'
        }));
        monacoInstance.editor.setModelMarkers(model, 'urdf-validator', markers);
      }
    }
  }, [monacoInstance, validationErrors]);

  const handleApply = useCallback(() => {
    if (editorRef.current) {
      const value = editorRef.current.getValue();
      // Validate before applying
      const errors = validateURDF(value, t);
      if (errors.length > 0) {
        // Still allow saving but show warning
        setValidationErrors(errors);
      }
      onCodeChange(value);
      setIsDirty(false);
    }
  }, [onCodeChange, t]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setCurrentCode(value);
      setIsDirty(value !== code);
      // Debounced validation
      const errors = validateURDF(value, t);
      setValidationErrors(errors);
    }
  }, [code, t]);

  // Ctrl+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) {
          handleApply();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, handleApply]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => cancelAnimationFrame(id);
  }, [isMaximized, size.height, size.width]);

  return (
    <DraggableWindow
      window={windowState}
      onClose={onClose}
      title={
        <>
          <div className="flex items-center gap-1.5 opacity-80">
            <Code className="w-4 h-4 text-system-blue" />
            <span className="font-semibold text-xs text-text-primary font-mono tracking-tight">{fileName}</span>
          </div>
          {isDirty && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-[9px] font-bold text-amber-600 dark:text-amber-400 rounded uppercase tracking-wider">
              {t.modified}
            </span>
          )}
        </>
      }
      headerActions={
        <button
          onClick={handleApply}
          disabled={!isDirty}
          className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded transition-all mr-2 ${isDirty
            ? 'bg-system-blue-solid hover:bg-system-blue-hover text-white shadow-sm'
            : 'text-text-tertiary bg-transparent cursor-not-allowed'
          }`}
          title={t.saveTooltip}
        >
          <Save className="w-3 h-3" />
          <span>{t.save}</span>
        </button>
      }
      className={`fixed z-50 flex flex-col bg-panel-bg text-text-primary rounded-2xl shadow-xl border border-border-black overflow-hidden ${isMaximized ? 'inset-0 !transform-none !w-full !h-full rounded-none' : ''}`}
      headerClassName="h-10 bg-element-bg border-b border-border-black flex items-center justify-between px-3 select-none"
      headerLeftClassName="flex items-center gap-2.5"
      headerDraggableClassName="cursor-move"
      headerDraggingClassName="cursor-move"
      showMinimizeButton={false}
      maximizeTitle={t.maximize}
      restoreTitle={t.restore}
      closeTitle={t.close}
      onHeaderDoubleClick={toggleMaximize}
      controlButtonClassName="p-1.5 hover:bg-element-hover rounded-md transition-colors"
      closeButtonClassName="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded transition-colors"
      rightResizeHandleClassName="absolute top-10 right-0 w-1.5 bottom-7 cursor-ew-resize z-40 hover:bg-system-blue/30 transition-colors"
      bottomResizeHandleClassName="absolute bottom-0 left-0 h-1.5 right-0 cursor-ns-resize z-40 hover:bg-system-blue/30 transition-colors"
      cornerResizeHandleClassName="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 hover:bg-system-blue/40 transition-colors"
      rightResizeDirection="e"
      bottomResizeDirection="s"
      cornerResizeDirection="se"
      controlIcons={{
        maximize: <Maximize className="w-3.5 h-3.5 text-text-tertiary" />,
        restore: <Minimize className="w-3.5 h-3.5 text-text-tertiary" />,
        close: <X className="w-4 h-4" />,
      }}
    >

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden relative">
        {!isEditorReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel-bg z-10">
            <Loader2 className="w-6 h-6 animate-spin text-system-blue" />
          </div>
        )}
        <Editor
          height="100%"
          defaultLanguage="xml"
          defaultValue={code}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onMount={(editor) => {
            editorRef.current = editor;
            setIsEditorReady(true);
            // Force layout after mount to fix initial blank screen
            requestAnimationFrame(() => {
              editor.layout();
            });
          }}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
            fontLigatures: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: false, // Performance optimization
            tabSize: 2,
            formatOnPaste: true,
            formatOnType: true,
            lineNumbersMinChars: 3,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'all',
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="h-7 bg-element-bg border-t border-border-black flex items-center px-3 justify-between shrink-0 text-[10px] select-none">
        <div className="flex items-center gap-3">
          {validationErrors.length > 0 ? (
            <button
              className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              onClick={() => {
                // Jump to first error line
                if (editorRef.current && validationErrors[0]) {
                  editorRef.current.revealLineInCenter(validationErrors[0].line);
                  editorRef.current.setPosition({ lineNumber: validationErrors[0].line, column: 1 });
                  editorRef.current.focus();
                }
              }}
              title={validationErrors.map(e => `Line ${e.line}: ${e.message}`).join('\n')}
            >
              <AlertCircle className="w-3 h-3" />
              <span>{validationErrors.length} {t.problems}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle className="w-3 h-3" />
              <span>{t.noErrors}</span>
            </div>
          )}
          <div className="w-px h-3 bg-border-black" />
          <div className="flex items-center gap-1.5 text-text-secondary">
            <span>URDF/XML</span>
          </div>
        </div>
        <div className="text-text-tertiary font-mono">
          {isMaximized ? t.maximized : `${Math.round(size.width)} × ${Math.round(size.height)}`}
        </div>
      </div>

    </DraggableWindow>
  );
};
