import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Loader2, Search, Star } from 'lucide-react';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { translations } from '@/shared/i18n';
import {
  CATEGORIES,
  getCategoryName,
  ROBOT_MODELS,
} from '../data/galleryModels';
import { GalleryModelCard } from './GalleryModelCard';
import { GalleryModelDetail } from './GalleryModelDetail';
import type { GalleryCategoryId, GalleryDetailTab, RobotModel } from '../types';

interface URDFGalleryProps {
  onClose: () => void;
  lang: 'en' | 'zh';
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const URDFGallery: React.FC<URDFGalleryProps> = ({ onClose, lang, onImport }) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GalleryCategoryId>('all');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<GalleryDetailTab>('overview');
  const [isDownloading, setIsDownloading] = useState(false);

  const windowState = useDraggableWindow({
    defaultSize: { width: 1120, height: 720 },
    minSize: { width: 720, height: 520 },
    centerOnMount: true,
    enableMinimize: true,
  });
  const { isMinimized, size, isResizing } = windowState;

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const syncTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const downloadFromGithub = async (model: RobotModel) => {
    if (!model.urdfPath) return;
    setIsDownloading(true);

    try {
      const url = new URL(model.urdfPath);
      const parts = url.pathname.split('/').filter(Boolean);
      const owner = parts[0];
      const repo = parts[1];
      const branch = parts[3];
      const path = parts.slice(4).join('/');

      if (!(window as any).showDirectoryPicker) {
        throw new Error(t.galleryFileSystemAccessUnsupported);
      }

      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      });

      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(t.galleryGithubApiRequestFailed);
      }

      const contents = await response.json();

      const downloadRecursive = async (
        items: any[],
        currentHandle: FileSystemDirectoryHandle,
      ) => {
        for (const item of items) {
          if (item.type === 'file') {
            const fileRes = await fetch(item.download_url);
            const blob = await fileRes.blob();
            const fileHandle = await currentHandle.getFileHandle(item.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          } else if (item.type === 'dir') {
            const newDirHandle = await currentHandle.getDirectoryHandle(item.name, { create: true });
            const subDirRes = await fetch(item.url);
            const subDirItems = await subDirRes.json();
            await downloadRecursive(subDirItems, newDirHandle);
          }
        }
      };

      await downloadRecursive(Array.isArray(contents) ? contents : [contents], dirHandle);

      setIsDownloading(false);
      if (confirm(t.downloadComplete)) {
        onClose();
        alert(t.loadFromLocal);
      }
    } catch (error: any) {
      setIsDownloading(false);
      console.error('Github download failed:', error);
      if (error.name !== 'AbortError') {
        alert(t.galleryDownloadFailed.replace('{message}', error.message));
      }
    }
  };

  const handleImportModel = async (model: RobotModel) => {
    if (!model.urdfPath) return;

    if (model.sourceType === 'url') {
      await downloadFromGithub(model);
      return;
    }

    setIsDownloading(true);
    try {
      const manifestUrl = `${model.urdfPath}/manifest.json`;
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) throw new Error(t.manifestNotFound);
      const files: string[] = await manifestRes.json();

      const orderedFiles = [...files];
      if (model.urdfFile) {
        const preferredIndex = orderedFiles.findIndex((filePath) => (
          filePath === model.urdfFile ||
          filePath.endsWith(`/${model.urdfFile}`) ||
          filePath.split('/').pop() === model.urdfFile
        ));

        if (preferredIndex > 0) {
          const [preferredFile] = orderedFiles.splice(preferredIndex, 1);
          orderedFiles.unshift(preferredFile);
        }
      }

      const fileObjects = await Promise.all(
        orderedFiles.map(async (filePath) => {
          const res = await fetch(`${model.urdfPath}/${filePath}`);
          const blob = await res.blob();
          const fileName = filePath.split('/').pop()!;
          const file = new File([blob], fileName, { type: blob.type });

          const rootFolder = model.urdfPath?.split('/').pop() || model.name.replace(/\s+/g, '_');
          Object.defineProperty(file, 'webkitRelativePath', {
            value: `${rootFolder}/${filePath}`,
          });

          return file;
        }),
      );

      const mockEvent = {
        target: {
          files: fileObjects,
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      onImport(mockEvent);
      setIsDownloading(false);
      onClose();
    } catch (error) {
      setIsDownloading(false);
      console.error('Failed to import model:', error);
      alert(t.loadFailed);
    }
  };

  const categoryCounts = useMemo(() => (
    CATEGORIES.reduce<Record<GalleryCategoryId, number>>((accumulator, category) => {
      if (category.id === 'all') {
        accumulator[category.id] = ROBOT_MODELS.length;
      } else {
        accumulator[category.id] = ROBOT_MODELS.filter((model) => model.category === category.id).length;
      }

      return accumulator;
    }, { all: ROBOT_MODELS.length, Quadruped: 0, Manipulator: 0, Humanoid: 0, Mobile: 0 })
  ), []);

  const filteredModels = useMemo(() => (
    ROBOT_MODELS.filter((model) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch = normalizedQuery.length === 0 ||
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.description.toLowerCase().includes(normalizedQuery) ||
        model.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      const matchesCategory = selectedCategory === 'all' || model.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
  ), [searchQuery, selectedCategory]);

  const selectedModel = useMemo(() => (
    selectedModelId
      ? ROBOT_MODELS.find((model) => model.id === selectedModelId) ?? null
      : null
  ), [selectedModelId]);

  const relatedModels = useMemo(() => {
    if (!selectedModel) return [];

    return ROBOT_MODELS
      .filter((model) => model.category === selectedModel.category && model.id !== selectedModel.id)
      .sort((left, right) => right.stars - left.stars)
      .slice(0, 3);
  }, [selectedModel]);

  const handleCategoryChange = (categoryId: GalleryCategoryId) => {
    setSelectedCategory(categoryId);
    setSelectedModelId(null);
    setActiveDetailTab('overview');
  };

  const handleOpenModel = (model: RobotModel) => {
    setSelectedModelId(model.id);
    setActiveDetailTab('overview');
  };

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/50" onClick={onClose} />

      <DraggableWindow
        window={windowState}
        onClose={onClose}
        title={(
          <>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-border-black bg-element-bg p-1.5 text-text-primary">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-text-primary">{t.urdfGallery}</h1>
                <p className="hidden text-[11px] text-text-tertiary md:block">
                  {selectedModel ? t.galleryDetails : t.findNextProject}
                </p>
              </div>
            </div>

            {!isMinimized && (
              <div className="relative ml-4 hidden w-72 md:flex">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  placeholder={t.searchModels}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-lg border border-border-black bg-input-bg py-1.5 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-tertiary transition-all focus:border-system-blue focus:ring-2 focus:ring-system-blue/25"
                  onMouseDown={(event) => event.stopPropagation()}
                />
              </div>
            )}
          </>
        )}
        className="z-[100] flex flex-col overflow-hidden rounded-2xl border border-border-black bg-panel-bg text-text-primary shadow-xl"
        headerClassName="flex h-14 items-center justify-between border-b border-border-black bg-element-bg px-4"
        interactionClassName="select-none"
        draggingClassName="cursor-grabbing"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="cursor-grabbing"
        minimizeTitle={t.minimize}
        maximizeTitle={t.maximize}
        restoreTitle={t.restore}
        closeTitle={t.close}
        controlButtonClassName="rounded-md p-1.5 transition-colors hover:bg-element-hover"
        closeButtonClassName="rounded p-1.5 text-text-tertiary transition-colors hover:bg-red-500 hover:text-white"
        rightResizeHandleClassName="absolute right-0 top-0 bottom-0 z-20 w-2 cursor-ew-resize transition-colors hover:bg-system-blue/20"
        bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 z-20 h-2 cursor-ns-resize transition-colors hover:bg-system-blue/20"
        cornerResizeHandleClassName="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize transition-colors hover:bg-system-blue/30"
        cornerResizeHandle={(
          <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 14H10V12H12V10H14V14Z" />
            <path d="M14 8H12V6H14V8Z" />
            <path d="M8 14H6V12H8V14Z" />
          </svg>
        )}
      >
        {!isMinimized && (
          <div className="relative flex flex-1 overflow-hidden">
            <div className="hidden w-56 overflow-y-auto border-r border-border-black bg-element-bg p-3 lg:block">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                    {t.categories}
                  </h3>
                  <div className="space-y-1">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => handleCategoryChange(category.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30 ${
                          selectedCategory === category.id
                            ? 'bg-system-blue/10 font-medium text-system-blue'
                            : 'text-text-secondary hover:bg-element-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <category.icon className="h-3.5 w-3.5" />
                          {getCategoryName(category.id, t)}
                        </span>
                        <span className="rounded-full bg-panel-bg px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          {categoryCounts[category.id]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-panel-bg">
              <div className="p-4">
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => handleCategoryChange(category.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        selectedCategory === category.id
                          ? 'border-system-blue/20 bg-system-blue/10 text-system-blue'
                          : 'border-border-black bg-element-bg text-text-secondary'
                      }`}
                    >
                      {getCategoryName(category.id, t)}
                    </button>
                  ))}
                </div>

                {selectedModel ? (
                  <GalleryModelDetail
                    model={selectedModel}
                    relatedModels={relatedModels}
                    lang={lang}
                    theme={theme}
                    activeTab={activeDetailTab}
                    onTabChange={setActiveDetailTab}
                    onBack={() => setSelectedModelId(null)}
                    onImport={handleImportModel}
                    onSelectModel={handleOpenModel}
                  />
                ) : (
                  <>
                    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-system-blue">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span>{t.featuredModels}</span>
                        </div>
                        <h2 className="text-2xl font-semibold text-text-primary">
                          {t.findNextProject}
                        </h2>
                        <p className="mt-1 text-sm text-text-secondary">
                          {selectedCategory === 'all'
                            ? `${filteredModels.length} ${t.allModels}`
                            : `${filteredModels.length} · ${getCategoryName(selectedCategory, t)}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                      {filteredModels.map((model) => (
                        <GalleryModelCard
                          key={model.id}
                          model={model}
                          lang={lang}
                          theme={theme}
                          onOpen={handleOpenModel}
                          onImport={handleImportModel}
                        />
                      ))}
                    </div>

                    {filteredModels.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-element-bg">
                          <Search className="h-6 w-6 text-text-tertiary" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold text-text-primary">
                          {t.noModelsFound}
                        </h3>
                        <p className="text-sm text-text-secondary">
                          {t.changeSearchKeywords}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {isDownloading && (
          <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-border-black bg-panel-bg px-3 py-2 shadow-md">
            <Loader2 className="h-4 w-4 animate-spin text-system-blue" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-primary">{t.processing}</span>
              <span className="text-[9px] text-text-tertiary">{t.fetchingResources}</span>
            </div>
          </div>
        )}

        {isResizing && (
          <div className="absolute bottom-2 right-2 z-50 rounded bg-system-blue-solid px-2 py-1 font-mono text-[10px] text-white">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  );
};

export default URDFGallery;
