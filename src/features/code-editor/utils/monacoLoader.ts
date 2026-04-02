import { loader } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';

function resolveDefaultMonacoVsPath(): string {
  const baseUrl = String(import.meta.env.BASE_URL || '/').trim();
  const normalizedBaseUrl = baseUrl === '/'
    ? ''
    : `/${baseUrl.replace(/^\/+|\/+$/g, '')}`;

  // Prefer the vendored Monaco runtime under public/ so the app startup path
  // does not depend on an external CDN being reachable.
  return `${normalizedBaseUrl}/monaco-editor/min/vs`;
}

const DEFAULT_MONACO_VS_PATH = resolveDefaultMonacoVsPath();

const resolveMonacoVsPath = (): string => {
  const configured = String(import.meta.env.VITE_MONACO_VS_PATH || '').trim();
  const path = configured.length > 0 ? configured : DEFAULT_MONACO_VS_PATH;
  return path.replace(/\/+$/, '');
};

const monacoVsPath = resolveMonacoVsPath();

loader.config({
  paths: {
    vs: monacoVsPath,
  },
  'vs/nls': {
    availableLanguages: {
      '*': 'en',
    },
  },
});

export type MonacoInstance = typeof Monaco;

let monacoLoaderPromise: Promise<MonacoInstance> | null = null;
let monacoWorkerWarmupPromise: Promise<void> | null = null;

const ensureXmlDerivedLanguage = (
  monacoInstance: MonacoInstance,
  _id: string,
  _aliases: string[],
) => {
  // CDN runtime uses Monaco's built-in XML language directly.
  // URDF/Xacro behavior is provided via editor-side completion/validation logic.
  void monacoInstance;
};

export const ensureSourceCodeEditorLanguages = (
  monacoInstance: MonacoInstance,
): MonacoInstance => {
  ensureXmlDerivedLanguage(monacoInstance, 'urdf', ['URDF']);
  ensureXmlDerivedLanguage(monacoInstance, 'xacro', ['Xacro']);
  return monacoInstance;
};

export const preloadMonacoEditor = (): Promise<MonacoInstance> => {
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = loader.init()
      .then((monacoInstance) => ensureSourceCodeEditorLanguages(monacoInstance))
      .catch((error) => {
        monacoLoaderPromise = null;
        throw error;
      });
  }

  return monacoLoaderPromise;
};

export const preloadMonacoEditorWorker = (): Promise<void> => {
  if (!monacoWorkerWarmupPromise) {
    monacoWorkerWarmupPromise = preloadMonacoEditor().then(() => undefined).catch((error) => {
      monacoWorkerWarmupPromise = null;
      throw error;
    });
  }

  return monacoWorkerWarmupPromise;
};

export const getMonacoVsPath = (): string => monacoVsPath;
