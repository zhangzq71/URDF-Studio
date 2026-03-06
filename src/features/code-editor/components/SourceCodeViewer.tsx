/**
 * SourceCodeViewer - Read-only code viewer with syntax highlighting
 * Features: syntax highlighting, copy to clipboard, download
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Copy, Check, FileCode, Download } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Theme } from '@/types';
import type { Language } from '@/store';

// i18n texts for viewer
const viewerTexts = {
  en: {
    download: 'Download',
    downloadFile: 'Download File',
    copy: 'Copy',
    copied: 'Copied!',
    copyToClipboard: 'Copy to Clipboard',
    readOnlyView: 'Read-only View',
  },
  zh: {
    download: '下载',
    downloadFile: '下载文件',
    copy: '复制',
    copied: '已复制！',
    copyToClipboard: '复制到剪贴板',
    readOnlyView: '只读视图',
  }
};

export interface SourceCodeViewerProps {
  code: string;
  onClose: () => void;
  theme: Theme;
  fileName?: string;
  lang?: Language;
}

export const SourceCodeViewer: React.FC<SourceCodeViewerProps> = ({
  code,
  onClose,
  theme,
  fileName = 'robot.urdf',
  lang = 'en'
}) => {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = viewerTexts[lang];

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[80vh] bg-panel-bg rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border-black animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-black bg-element-bg">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-system-blue" />
            <span className="font-mono text-sm font-bold text-text-primary">{fileName}</span>
            <span className="text-xs text-text-tertiary ml-2">({(code.length / 1024).toFixed(1)} KB)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-element-hover rounded transition-colors"
              title={t.downloadFile}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t.download}</span>
            </button>

            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                copied
                  ? 'bg-system-blue/10 dark:bg-system-blue/20 text-system-blue'
                  : 'text-text-secondary hover:bg-element-hover'
              }`}
              title={t.copyToClipboard}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? t.copied : t.copy}</span>
            </button>

            <div className="w-px h-4 bg-border-black mx-1" />

            <button
              onClick={onClose}
              className="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-hidden relative group">
          <SyntaxHighlighter
            language="xml"
            style={theme === 'dark' ? vscDarkPlus : vs}
            showLineNumbers={true}
            wrapLines={true}
            customStyle={{
              margin: 0,
              padding: '1.5rem',
              height: '100%',
              fontSize: '13px',
              lineHeight: '1.5',
              backgroundColor: theme === 'dark' ? 'var(--ui-bg)' : 'var(--ui-panel-bg)',
            }}
            codeTagProps={{
                style: { fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace" }
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-element-bg border-t border-border-black flex justify-between items-center">
             <div className="text-[10px] text-text-tertiary">
                 {t.readOnlyView}
             </div>
             <div className="text-[10px] text-text-tertiary font-mono">
                 XML / URDF
             </div>
        </div>
      </div>
    </div>
  );
};
