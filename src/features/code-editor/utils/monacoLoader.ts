import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import { conf as xmlConf, language as xmlLanguage } from 'monaco-editor/esm/vs/basic-languages/xml/xml.js';
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

const ensureXmlDerivedLanguage = (
  monacoInstance: MonacoInstance,
  id: string,
  aliases: string[],
) => {
  if (monacoInstance.languages.getLanguages().some((language) => language.id === id)) {
    return;
  }

  monacoInstance.languages.register({ id, aliases });
  monacoInstance.languages.setLanguageConfiguration(id, xmlConf);
  monacoInstance.languages.setMonarchTokensProvider(id, xmlLanguage);
};

export const ensureSourceCodeEditorLanguages = (
  monacoInstance: MonacoInstance = monaco,
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
