export const loadSourceCodeEditorModule = () => import('@/features/code-editor/components/SourceCodeEditor');

export const preloadSourceCodeEditor = async () => {
  const [, monacoLoaderModule] = await Promise.all([
    loadSourceCodeEditorModule(),
    import('@/features/code-editor/utils/monacoLoader'),
  ]);

  await monacoLoaderModule.preloadMonacoEditor();
};
