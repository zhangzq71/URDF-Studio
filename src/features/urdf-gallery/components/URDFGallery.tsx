import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutGrid, Search, Box, User, Heart, Download,
  Star, Clock, Globe, Loader2
} from 'lucide-react';
import { RobotThumbnail3D } from './RobotThumbnail3D';
import { DraggableWindow } from '@/shared/components';
import { translations } from '@/shared/i18n';
import { useDraggableWindow } from '@/shared/hooks';

interface URDFGalleryProps {
  onClose: () => void;
  lang: 'en' | 'zh';
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface RobotModel {
  id: string;
  name: string;
  author: string;
  description: string;
  thumbnail: string;
  category: string;
  stars: number;
  downloads: number;
  tags: string[];
  lastUpdated: string;
  urdfPath?: string;
  urdfFile?: string;
  previewVideo?: string;
  sourceType: 'server' | 'url';
}

interface ModelTranslation {
  name_zh: string;
  description_zh: string;
  tags_zh: string[];
}

const MODEL_TRANSLATIONS: Record<string, ModelTranslation> = {
  'go2': { name_zh: 'Unitree Go2 四足机器人', description_zh: '高性能四足机器人，适用于科研和娱乐场景。', tags_zh: ['科研', '四足', '移动'] },
  'go1': { name_zh: 'Unitree Go1 四足机器人', description_zh: '消费级四足机器人，适合教育和入门研究。', tags_zh: ['教育', '四足', '入门'] },
  'g1': { name_zh: 'Unitree G1 人形机器人', description_zh: '通用人形机器人，适用于教育和科研。', tags_zh: ['人形', '双足', '科研'] },
  'h1': { name_zh: 'Unitree H1 人形机器人', description_zh: '高性能人形机器人，适用于高级研究。', tags_zh: ['人形', '高性能', '科研'] },
  'h1_2': { name_zh: 'Unitree H1 2.0 人形机器人', description_zh: '第二代高性能人形机器人。', tags_zh: ['人形', '双足', '新一代'] },
  'a1': { name_zh: 'Unitree A1 四足机器人', description_zh: '敏捷四足机器人，适合动态运动研究。', tags_zh: ['科研', '四足', '敏捷'] },
  'b1': { name_zh: 'Unitree B1 四足机器人', description_zh: '工业级四足机器人，适用于巡检任务。', tags_zh: ['工业', '四足', '巡检'] },
  'b2': { name_zh: 'Unitree B2 四足机器人', description_zh: '新一代工业四足机器人。', tags_zh: ['工业', '四足', '巡检'] },
  'aliengo': { name_zh: 'Unitree Aliengo 四足机器人', description_zh: '中型四足机器人，适用于多种场景。', tags_zh: ['科研', '四足', '通用'] },
  'z1': { name_zh: 'Unitree Z1 机械臂', description_zh: '轻量级协作机械臂。', tags_zh: ['机械臂', '协作', '轻量'] },
};

const ROBOT_MODELS: RobotModel[] = [
  {
    id: 'go2',
    name: 'Unitree Go2',
    author: 'Unitree Robotics',
    description: 'High-performance quadruped robot for research and entertainment.',
    thumbnail: '/library/urdf/unitree/go2_description/urdf/Normal_collision_model.png',
    category: 'Quadruped',
    stars: 1250,
    downloads: 3200,
    tags: ['Research', 'Quadruped', 'Mobile'],
    lastUpdated: '2026-01-17',
    urdfPath: '/library/urdf/unitree/go2_description',
    sourceType: 'server'
  },
  {
    id: 'go1',
    name: 'Unitree Go1',
    author: 'Unitree Robotics',
    description: 'Consumer-grade quadruped robot for education and beginner research.',
    thumbnail: '',
    category: 'Quadruped',
    stars: 980,
    downloads: 2100,
    tags: ['Education', 'Quadruped', 'Beginner'],
    lastUpdated: '2026-01-15',
    urdfPath: '/library/urdf/unitree/go1_description',
    sourceType: 'server'
  },
  {
    id: 'g1',
    name: 'Unitree G1',
    author: 'Unitree Robotics',
    description: 'General-purpose humanoid robot for education and research.',
    thumbnail: '/library/urdf/unitree/g1_description/thumbnail.png',
    category: 'Humanoid',
    stars: 2100,
    downloads: 4500,
    tags: ['Humanoid', 'Bipedal', 'Research'],
    lastUpdated: '2026-01-17',
    urdfPath: '/library/urdf/unitree/g1_description',
    urdfFile: 'g1_29dof_with_hand.urdf',
    sourceType: 'server'
  },
  {
    id: 'h1',
    name: 'Unitree H1',
    author: 'Unitree Robotics',
    description: 'High-performance humanoid robot for advanced research.',
    thumbnail: '/library/urdf/unitree/h1_description/thumbnail.png',
    category: 'Humanoid',
    stars: 1800,
    downloads: 3800,
    tags: ['Humanoid', 'High-Performance', 'Research'],
    lastUpdated: '2026-01-16',
    urdfPath: '/library/urdf/unitree/h1_description',
    sourceType: 'server'
  },
  {
    id: 'h1_2',
    name: 'Unitree H1 2.0',
    author: 'Unitree Robotics',
    description: 'Second generation high-performance humanoid robot.',
    thumbnail: '/library/urdf/unitree/h1_2_description/thumbnail.png',
    category: 'Humanoid',
    stars: 1500,
    downloads: 2800,
    tags: ['Humanoid', 'Bipedal', 'Next-Gen'],
    lastUpdated: '2026-01-18',
    urdfPath: '/library/urdf/unitree/h1_2_description',
    sourceType: 'server'
  },
  {
    id: 'a1',
    name: 'Unitree A1',
    author: 'Unitree Robotics',
    description: 'Agile quadruped robot for dynamic motion research.',
    thumbnail: '/library/urdf/unitree/a1_description/meshes/trunk_A1.png',
    category: 'Quadruped',
    stars: 1100,
    downloads: 2500,
    tags: ['Research', 'Quadruped', 'Agile'],
    lastUpdated: '2026-01-14',
    urdfPath: '/library/urdf/unitree/a1_description',
    sourceType: 'server'
  },
  {
    id: 'b1',
    name: 'Unitree B1',
    author: 'Unitree Robotics',
    description: 'Industrial-grade quadruped robot for inspection tasks.',
    thumbnail: '',
    category: 'Quadruped',
    stars: 750,
    downloads: 1800,
    tags: ['Industrial', 'Quadruped', 'Inspection'],
    lastUpdated: '2026-01-12',
    urdfPath: '/library/urdf/unitree/b1_description',
    sourceType: 'server'
  },
  {
    id: 'b2',
    name: 'Unitree B2',
    author: 'Unitree Robotics',
    description: 'Next-generation industrial quadruped robot.',
    thumbnail: '/library/urdf/unitree/b2_description_mujoco/Screenshot from 2023-12-11 21-44-55.png',
    category: 'Quadruped',
    stars: 890,
    downloads: 2000,
    tags: ['Industrial', 'Quadruped', 'Inspection'],
    lastUpdated: '2026-01-13',
    urdfPath: '/library/urdf/unitree/b2_description',
    sourceType: 'server'
  },
  {
    id: 'aliengo',
    name: 'Unitree Aliengo',
    author: 'Unitree Robotics',
    description: 'Medium-sized quadruped robot for various applications.',
    thumbnail: '/library/urdf/unitree/aliengo_description/meshes/trunk_uv_base_final.png',
    category: 'Quadruped',
    stars: 650,
    downloads: 1500,
    tags: ['Research', 'Quadruped', 'General'],
    lastUpdated: '2026-01-10',
    urdfPath: '/library/urdf/unitree/aliengo_description',
    sourceType: 'server'
  },
];

const CATEGORIES = [
  { id: 'all', icon: Box },
  { id: 'Quadruped', icon: Box },
  { id: 'Manipulator', icon: Box },
  { id: 'Humanoid', icon: User },
  { id: 'Mobile', icon: Globe },
];

// Get translated category name
const getCategoryName = (categoryId: string, t: typeof translations['en']) => {
  switch (categoryId) {
    case 'all': return t.allModels;
    case 'Quadruped': return t.quadruped;
    case 'Manipulator': return t.manipulators;
    case 'Humanoid': return t.humanoids;
    case 'Mobile': return t.mobileBases;
    default: return categoryId;
  }
};

const RobotThumbnail = ({
  model,
  theme,
  previewLabel,
}: {
  model: RobotModel;
  theme?: 'light' | 'dark';
  previewLabel: string;
}) => {
  // Use 3D preview for server-hosted models with urdfPath
  if (model.sourceType === 'server' && model.urdfPath && !model.urdfPath.startsWith('http')) {
    return (
      <RobotThumbnail3D 
        urdfPath={model.urdfPath}
        urdfFile={model.urdfFile}
        theme={theme}
        fallbackLabel={previewLabel}
      />
    );
  }

  // Fallback to placeholder for URL-based models
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-text-tertiary w-full h-full">
      <Box className="w-10 h-10 opacity-40" />
      <span className="text-[9px] uppercase tracking-widest font-medium opacity-60">
        {model.sourceType === 'url' ? 'GitHub' : previewLabel}
      </span>
    </div>
  );
};

export const URDFGallery: React.FC<URDFGalleryProps> = ({ onClose, lang, onImport }) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
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
  
  // Detect theme from document class
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
    
    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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
        throw new Error(lang === 'zh' ? '您的浏览器不支持文件系统访问 API' : 'Your browser does not support File System Access API');
      }
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(lang === 'zh' ? 'GitHub API 请求失败' : 'GitHub API request failed');
      }
      const contents = await response.json();

      const downloadRecursive = async (items: any[], currentHandle: FileSystemDirectoryHandle) => {
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
      if (confirm(lang === 'zh' ? '下载完成！是否立即从本地文件夹加载该模型？' : 'Download complete! Would you like to load the model from the local folder now?')) {
        onClose();
        alert(lang === 'zh' ? '请点击主界面的"导入本地 URDF"并选择刚才下载的文件夹。' : 'Please click "Import Local URDF" on the main screen and select the folder you just downloaded.');
      }
      
    } catch (err: any) {
      setIsDownloading(false);
      console.error('Github download failed:', err);
      if (err.name !== 'AbortError') {
        alert(lang === 'zh' ? `下载失败: ${err.message}` : `Download failed: ${err.message}`);
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
      
      const fileObjects = await Promise.all(files.map(async (filePath) => {
          const res = await fetch(`${model.urdfPath}/${filePath}`);
          const blob = await res.blob();
          const fileName = filePath.split('/').pop()!;
          const file = new File([blob], fileName, { type: blob.type });
          
          const rootFolder = model.urdfPath?.split('/').pop() || model.name.replace(/\s+/g, '_');
          Object.defineProperty(file, 'webkitRelativePath', {
              value: `${rootFolder}/${filePath}`
          });
          
          return file;
      }));
      
      const mockEvent = {
          target: {
              files: fileObjects
          }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      
      onImport(mockEvent);
      setIsDownloading(false);
      onClose();
      
    } catch (err) {
      setIsDownloading(false);
      console.error('Failed to import model:', err);
      alert(lang === 'zh' ? '加载模型文件失败，请确保 manifest.json 存在。' : 'Failed to load model files. Please ensure manifest.json exists.');
    }
  };

  const filteredModels = useMemo(() => {
    return ROBOT_MODELS.filter(model => {
      const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            model.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || model.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

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
                  {filteredModels.map(model => (
                    <div key={model.id} className="group bg-panel-bg rounded-lg border border-border-black hover:border-system-blue overflow-hidden transition-all shadow-sm hover:shadow-lg flex flex-col">
                      {/* Thumbnail Area */}
                      <div className="relative h-36 overflow-hidden bg-element-bg flex items-center justify-center">
                        <RobotThumbnail model={model} theme={theme} previewLabel={t.preview} />
                        
                        <div className="absolute top-2 left-2 flex gap-1">
                          <span className="px-1.5 py-0.5 bg-panel-bg text-text-primary text-[9px] font-semibold rounded uppercase shadow-sm border border-border-black">
                            {getCategoryName(model.category, t)}
                          </span>
                        </div>
                        
                        {/* Action Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 pointer-events-none">
                          <button 
                            onClick={() => handleImportModel(model)}
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
                            {lang === 'zh' && MODEL_TRANSLATIONS[model.id]?.name_zh ? MODEL_TRANSLATIONS[model.id].name_zh : model.name}
                          </h3>
                          <button className="text-text-tertiary hover:text-rose-500 transition-colors">
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-2">
                          <User className="w-3 h-3" />
                          <span>{t.unitreeTech}</span>
                        </div>

                        <p className="text-xs text-text-secondary line-clamp-2 mb-2 flex-1">
                          {lang === 'zh' && MODEL_TRANSLATIONS[model.id]?.description_zh ? MODEL_TRANSLATIONS[model.id].description_zh : model.description}
                        </p>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {(lang === 'zh' && MODEL_TRANSLATIONS[model.id]?.tags_zh ? MODEL_TRANSLATIONS[model.id].tags_zh : model.tags).slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-element-bg text-text-secondary text-[9px] rounded-full">
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-border-black flex items-center justify-between text-[10px] text-text-tertiary">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              <span>{model.stars}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              <span>{model.downloads}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{model.lastUpdated}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredModels.length === 0 && (
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
