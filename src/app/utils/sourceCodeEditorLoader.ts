let sourceCodeEditorModulePromise: Promise<typeof import('@/features/code-editor/components/SourceCodeEditor')> | null = null;
let sourceCodeEditorRuntimePromise: Promise<
  [
    typeof import('@monaco-editor/react'),
    typeof import('@/features/code-editor/utils/monacoLoader'),
  ]
> | null = null;

export const loadSourceCodeEditorModule = () => {
  if (!sourceCodeEditorModulePromise) {
    sourceCodeEditorModulePromise = import('@/features/code-editor/components/SourceCodeEditor');
  }

  return sourceCodeEditorModulePromise;
};

export const loadSourceCodeEditorRuntime = () => {
  if (!sourceCodeEditorRuntimePromise) {
    sourceCodeEditorRuntimePromise = Promise.all([
      import('@monaco-editor/react'),
      import('@/features/code-editor/utils/monacoLoader'),
    ]);
  }

  return sourceCodeEditorRuntimePromise;
};

export const preloadSourceCodeEditor = () => loadSourceCodeEditorModule();

export const preloadSourceCodeEditorRuntime = async () => {
  const [, monacoLoaderModule] = await loadSourceCodeEditorRuntime();
  await monacoLoaderModule.preloadMonacoEditor();
};
