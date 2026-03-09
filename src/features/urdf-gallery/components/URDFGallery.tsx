import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  LayoutGrid, Search, Box, User, Heart, Download,
  Star, Clock, Globe, Loader2
} from 'lucide-react';
import { RobotPreview } from './RobotPreview';
import { DraggableWindow } from '@/shared/components';
import { translations } from '@/shared/i18n';
import { useDraggableWindow, useEffectiveTheme } from '@/shared/hooks';

// Define localized interface without thumbnail/urdfPath as requested
interface URDFStudioAsset {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  stars: number;
  downloads: number;
  tags: string[];
  lastUpdated: string;
  urdfFile?: string;
  previewVideo?: string;
  name_zh?: string;
  description_zh?: string;
  tags_zh?: string[];
  author_zh?: string;
}

interface URDFGalleryProps {
  onClose: () => void;
  lang: 'en' | 'zh';
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}



const CATEGORIES = [
  { id: 'all', icon: Box },
  { id: 'Full Robots', icon: User },
  { id: 'End-effectors', icon: Box },
  { id: 'Sensors', icon: Box },
  { id: 'Articulated Objects', icon: Globe },
  { id: 'Data Assets', icon: Box },
];

// Get translated category name
const getCategoryName = (categoryId: string, t: typeof translations['en']) => {
  switch (categoryId) {
    case 'all': return t.allModels;
    case 'Full Robots': return t.fullRobots;
    case 'End-effectors': return t.endEffectors;
    case 'Sensors': return t.sensors;
    case 'Articulated Objects': return t.articulatedObjects;
    case 'Data Assets': return t.dataAssets;
    default: return categoryId;
  }
};

const RobotThumbnail = ({
  asset,
  theme,
  previewLabel
}: {
  asset: URDFStudioAsset;
  theme?: 'light' | 'dark';
  previewLabel: string;
}) => {
  return (
    <RobotPreview
      modelId={asset.id}
      urdfFile={asset.urdfFile}
      theme={theme}
      fallbackLabel={previewLabel}
    />
  );
};

export const URDFGallery: React.FC<URDFGalleryProps> = ({ onClose, lang, onImport }) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assets, setAssets] = useState<URDFStudioAsset[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Fetch assets from backend
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const token = import.meta.env.VITE_API_TOKEN;
        const res = await fetch('/api/assets', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.data?.assets) {
          setAssets(json.data.assets);
        }
      } catch (err) {
        console.error('Failed to load gallery assets:', err);
      } finally {
        setIsLoadingList(false);
      }
    };
    fetchAssets();
  }, []);
  
  // Clear tags when language changes to avoid stale strings
  useEffect(() => {
    setSelectedTags([]);
  }, [lang]);

  // Compute all available tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    assets.forEach(asset => {
      const currentTags = lang === 'zh' && asset.tags_zh ? asset.tags_zh : asset.tags;
      currentTags.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [lang, assets]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const windowState = useDraggableWindow({
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 600, height: 400 },
    centerOnMount: true,
    enableMinimize: true,
  });
  const {
    isMinimized,
    size,
    isResizing,
  } = windowState;

  const theme = useEffectiveTheme();



  const handleImportAsset = async (asset: URDFStudioAsset) => {
    // Only import if we have an ID
    if (!asset.id) return;
    
    setIsDownloading(true);
    try {
      // Request backend to download asset by ID
      const token = import.meta.env.VITE_API_TOKEN;
      const response = await fetch('/api/download-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ assetId: asset.id }),
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success || !result.data?.files) {
         throw new Error(result.message || 'Failed to list files');
      }

      const filesData = result.data.files as { path: string, url: string }[];
      
      // Reorder logic: prioritize URDF file if specified
      if (asset.urdfFile) {
        const preferredIndex = filesData.findIndex((file) => (
          file.path === asset.urdfFile ||
          file.path.endsWith(`/${asset.urdfFile}`) ||
          file.path.split('/').pop() === asset.urdfFile
        ));

        if (preferredIndex > 0) {
          const [preferredFile] = filesData.splice(preferredIndex, 1);
          filesData.unshift(preferredFile);
        }
      }
      
      // Use root folder name provided by backend
      const rootFolderName = result.data.rootFolderName || asset.id;

      // Download all files in parallel
      const fileObjects = await Promise.all(filesData.map(async (fileInfo) => {
          const res = await fetch(fileInfo.url);
          if (!res.ok) throw new Error(`Failed to download ${fileInfo.path}`);
          const blob = await res.blob();
          
          // Get filename from path
          const fileName = fileInfo.path.split('/').pop() || 'unknown';
          
          const file = new File([blob], fileName, { type: blob.type });
          
          // Set webkitRelativePath property (critical for folder structure)
          // Ensure path separators are normalized if needed, though they usually come as /
          const relativePath = `${rootFolderName}/${fileInfo.path}`;
          
          Object.defineProperty(file, 'webkitRelativePath', {
              value: relativePath
          });
          
          return file;
      }));

      // Create mock event
      const mockEvent = {
          target: {
              files: fileObjects
          }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      // Trigger import
      onImport(mockEvent);
      setIsDownloading(false);
      onClose();
      
    } catch (err: any) {
      setIsDownloading(false);
      console.error('Failed to import asset details:', {
        message: err.message,
        stack: err.stack,
        original: err
      });
      alert(lang === 'zh' 
        ? `请求后端失败: ${err.message}` 
        : `Failed to request backend: ${err.message}`);
    }
  };

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      // 1. Category Filter
      if (selectedCategory !== 'all' && asset.category !== selectedCategory) {
        return false;
      }
      
      // 2. Tag Filter (Matches ALL selected tags)
      if (selectedTags.length > 0) {
        const assetTags = lang === 'zh' && asset.tags_zh ? asset.tags_zh : asset.tags;
        const hasAllTags = selectedTags.every(tag => assetTags.includes(tag));
        if (!hasAllTags) return false;
      }

      // 3. Search Filter
      const searchLower = searchQuery.toLowerCase();
      const name = (lang === 'zh' && asset.name_zh ? asset.name_zh : asset.name).toLowerCase();
      const desc = (lang === 'zh' && asset.description_zh ? asset.description_zh : asset.description).toLowerCase();
      const tags = (lang === 'zh' && asset.tags_zh ? asset.tags_zh : asset.tags).map(t => t.toLowerCase());

      const matchesSearch = name.includes(searchLower) || 
                            desc.includes(searchLower) ||
                            tags.some(tag => tag.includes(searchLower));

      return matchesSearch;
    });
  }, [searchQuery, selectedCategory, selectedTags, lang, assets]);

  return (
    <>
      {/* Backdrop - no blur */}
      <div 
        className="fixed inset-0 z-[90] bg-black/50"
        onClick={onClose}
      />
      
      {/* Floating Window */}
      <DraggableWindow
        window={windowState}
        onClose={onClose}
        title={
          <>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-element-bg text-text-primary border border-border-black">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-semibold text-text-primary">
                {t.urdfGallery}
              </h1>
            </div>

            {!isMinimized && (
              <div className="hidden md:flex ml-4 relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="text"
                  placeholder={t.searchModels}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-input-bg border border-border-black rounded-lg py-1.5 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:ring-2 focus:ring-system-blue/25 focus:border-system-blue transition-all"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        }
        className="z-[100] bg-panel-bg flex flex-col text-text-primary overflow-hidden rounded-2xl shadow-xl border border-border-black"
        headerClassName="h-12 border-b border-border-black flex items-center justify-between px-4 bg-element-bg shrink-0"
        interactionClassName="select-none"
        draggingClassName="cursor-grabbing"
        headerDraggableClassName="cursor-grab"
        headerDraggingClassName="cursor-grabbing"
        minimizeTitle={t.minimize}
        maximizeTitle={t.maximize}
        restoreTitle={t.restore}
        closeTitle={t.close}
        controlButtonClassName="p-1.5 hover:bg-element-hover rounded-md transition-colors"
        closeButtonClassName="p-1.5 text-text-tertiary hover:bg-red-500 hover:text-white rounded transition-colors"
        rightResizeHandleClassName="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-system-blue/20 transition-colors z-20"
        bottomResizeHandleClassName="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-system-blue/20 transition-colors z-20"
        cornerResizeHandleClassName="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-system-blue/30 transition-colors z-30"
        cornerResizeHandle={
          <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 14H10V12H12V10H14V14Z" />
            <path d="M14 8H12V6H14V8Z" />
            <path d="M8 14H6V12H8V14Z" />
          </svg>
        }
      >

        {/* Content - Hidden when minimized */}
        {!isMinimized && (
          <div className="flex-1 flex overflow-hidden relative">
            {/* Sidebar */}
            <div className="w-48 border-r border-border-black bg-element-bg p-3 overflow-y-auto hidden lg:block">
              <div className="space-y-4">
                <div>
                  <h3 className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2 px-2">
                    {t.categories}
                  </h3>
                  <div className="space-y-0.5">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all ${
                          selectedCategory === cat.id 
                            ? 'bg-system-blue/10 text-system-blue font-medium' 
                            : 'text-text-secondary hover:bg-element-hover'
                        }`}
                      >
                        <cat.icon className="w-3.5 h-3.5" />
                        {getCategoryName(cat.id, t)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags Section */}
                <div>
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    {t.tags}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {allTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-1 text-[10px] rounded-md transition-all border ${
                            isSelected 
                              ? 'bg-[#0060FA] text-white border-[#0060FA]' 
                              : 'bg-white dark:bg-black text-slate-600 dark:text-slate-400 border-slate-200 dark:border-border-black hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-panel-bg">
              <div className="p-4">
                {/* Page Header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-system-blue text-xs font-medium mb-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{t.featuredModels}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t.findNextProject}
                  </h2>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                    {filteredAssets.map(asset => (
                    <div key={asset.id} className="group bg-panel-bg rounded-lg border border-border-black hover:border-system-blue overflow-hidden transition-all shadow-sm hover:shadow-lg flex flex-col">
                      {/* Thumbnail Area */}
                      <div className="relative w-full aspect-video overflow-hidden bg-slate-100 dark:bg-black flex items-center justify-center">
                        <RobotThumbnail asset={asset} theme={theme}  previewLabel={t.preview}/>
                        
                        <div className="absolute top-2 left-2 flex gap-1">
                          <span className="px-1.5 py-0.5 bg-panel-bg text-text-primary text-[9px] font-semibold rounded uppercase shadow-sm border border-border-black">
                            {getCategoryName(asset.category, t)}
                          </span>
                        </div>

                        {/* Action Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                          <button 
                            onClick={() => handleImportAsset(asset)}
                            className="w-full py-1.5 bg-system-blue-solid text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-system-blue-hover transition-colors pointer-events-auto">
                            <Download className="w-3.5 h-3.5" />
                            {t.importNow}
                          </button>
                        </div>
                      </div>

                      {/* Details */}
                        <div className="p-3 flex-1 flex flex-col">
                          <div className="flex justify-between items-start mb-1">
                          <h3 className="font-semibold text-sm leading-tight text-text-primary group-hover:text-system-blue transition-colors">
                              {lang === 'zh' && asset.name_zh ? asset.name_zh : asset.name}
                            </h3>
                          <button className="text-text-tertiary hover:text-rose-500 transition-colors">
                            <Heart className="w-4 h-4" />
                          </button>
                            </div>
                        
                        <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-2">
                          <User className="w-3 h-3" />
                          <span>{lang === 'zh' && asset.author_zh ? asset.author_zh : asset.author}</span>
                          </div>
                          
                        <p className="text-xs text-text-secondary line-clamp-2 mb-2 flex-1">
                            {lang === 'zh' && asset.description_zh ? asset.description_zh : asset.description}
                          </p>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {(lang === 'zh' && asset.tags_zh ? asset.tags_zh : asset.tags).slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-element-bg text-text-secondary text-[9px] rounded-full">
                              #{tag}
                              </span>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-border-black flex items-center justify-between text-[10px] text-text-tertiary">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              <span>{asset.stars}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              <span>{asset.downloads}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{asset.lastUpdated}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                {filteredAssets.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-element-bg rounded-full flex items-center justify-center mb-3">
                      <Search className="w-6 h-6 text-text-tertiary" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-1">{t.noModelsFound}</h3>
                    <p className="text-sm text-text-secondary">{t.changeSearchKeywords}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Loading Indicator */}
        {isDownloading && (
          <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-panel-bg shadow-md rounded-lg border border-border-black">
            <Loader2 className="w-4 h-4 text-system-blue animate-spin" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-primary">{t.processing}</span>
              <span className="text-[9px] text-text-tertiary">{t.fetchingResources}</span>
            </div>
          </div>
        )}
        
        {/* Resize indicator when resizing */}
        {isResizing && (
          <div className="absolute bottom-2 right-2 z-50 px-2 py-1 bg-system-blue-solid text-white text-[10px] rounded font-mono">
            {size.width} × {size.height}
          </div>
        )}
      </DraggableWindow>
    </>
  );
};

export default URDFGallery;
