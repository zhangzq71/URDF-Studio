import type { AppMode, AssemblyState, RobotFile, RobotState, Theme } from '@/types';
import type { Language } from '@/store';
import { translations } from '@/shared/i18n';

export type TreeEditorTranslations = typeof translations.en;

export interface TreeEditorProps {
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onSelectGeometry?: (linkId: string, subType: 'visual' | 'collision', objectIndex?: number) => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddCollisionBody: (parentId: string) => void;
  onDelete: (id: string) => void;
  onNameChange: (name: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  showVisual: boolean;
  setShowVisual: (show: boolean) => void;
  mode: AppMode;
  lang: Language;
  collapsed?: boolean;
  onToggle?: () => void;
  theme: Theme;
  availableFiles?: RobotFile[];
  onLoadRobot?: (file: RobotFile) => void;
  currentFileName?: string;
  assemblyState?: AssemblyState | null;
  onAddComponent?: (file: RobotFile) => void;
  onDeleteLibraryFile?: (file: RobotFile) => void;
  onDeleteLibraryFolder?: (folderPath: string) => void;
  onDeleteAllLibraryFiles?: () => void;
  onExportLibraryFile?: (file: RobotFile, format: 'urdf' | 'mjcf') => void | Promise<void>;
  onCreateBridge?: () => void;
  onRemoveComponent?: (id: string) => void;
  onRemoveBridge?: (id: string) => void;
  onRenameComponent?: (id: string, name: string) => void;
  onPreviewFile?: (file: RobotFile) => void;
  previewFileName?: string;
}
