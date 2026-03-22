import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

type MonacoWorkerFactory = (workerId: string, label: string) => Worker;

interface MonacoEnvironmentShape {
  getWorker?: MonacoWorkerFactory;
}

const globalWithMonacoEnvironment = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironmentShape;
};

const createWorker = (): Worker => new editorWorker();

if (!globalWithMonacoEnvironment.MonacoEnvironment?.getWorker) {
  globalWithMonacoEnvironment.MonacoEnvironment = {
    ...globalWithMonacoEnvironment.MonacoEnvironment,
    // SourceCodeEditor only opens XML/plaintext documents, so the core editor worker is enough.
    getWorker: () => createWorker(),
  };
}

loader.config({
  monaco,
  'vs/nls': {
    availableLanguages: {
      '*': 'en',
    },
  },
});

export type MonacoInstance = typeof monaco;

let monacoLoaderPromise: Promise<MonacoInstance> | null = null;

export const preloadMonacoEditor = (): Promise<MonacoInstance> => {
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = loader.init().catch((error) => {
      monacoLoaderPromise = null;
      throw error;
    });
  }

  return monacoLoaderPromise;
};
