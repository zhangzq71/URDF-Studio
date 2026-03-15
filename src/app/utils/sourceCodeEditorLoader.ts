export const loadSourceCodeEditorModule = () => import('@/features/code-editor/components/SourceCodeEditor');

export const preloadSourceCodeEditor = async () => {
  const module = await loadSourceCodeEditorModule();
  return module.preloadSourceCodeEditor();
};
