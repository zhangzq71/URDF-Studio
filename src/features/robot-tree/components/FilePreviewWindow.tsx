import React, { useMemo } from 'react';
import { AlertCircle, FileCode } from 'lucide-react';
import { URDFViewer } from '@/features/urdf-viewer';
import { DraggableWindow } from '@/shared/components';
import { useDraggableWindow } from '@/shared/hooks';
import { translations } from '@/shared/i18n';
import type { Language } from '@/store';
import {
  generateURDF,
  processXacro,
  parseMJCF,
  parseURDF,
  parseUSDA,
} from '@/core/parsers';
import { GeometryType, type RobotFile, type RobotState, type Theme } from '@/types';

interface FilePreviewWindowProps {
  isOpen: boolean;
  file: RobotFile | null;
  availableFiles: RobotFile[];
  assets: Record<string, string>;
  lang: Language;
  theme: Theme;
  onClose: () => void;
}

function buildMeshPreviewState(file: RobotFile): RobotState {
  const meshName = file.name.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'mesh';
  const linkId = 'base_link';

  return {
    name: meshName,
    links: {
      [linkId]: {
        id: linkId,
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.MESH,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#808080',
          meshPath: file.name,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ef4444',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 1.0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0.1, ixy: 0, ixz: 0, iyy: 0.1, iyz: 0, izz: 0.1 },
        },
      },
    },
    joints: {},
    rootLinkId: linkId,
    selection: { type: null, id: null },
  };
}

export const FilePreviewWindow: React.FC<FilePreviewWindowProps> = ({
  isOpen,
  file,
  availableFiles,
  assets,
  lang,
  theme,
  onClose,
}) => {
  const t = translations[lang];

  const windowState = useDraggableWindow({
    isOpen,
    defaultPosition: { x: 180, y: 120 },
    defaultSize: { width: 700, height: 500 },
    minSize: { width: 420, height: 320 },
    centerOnMount: true,
    enableMinimize: true,
    enableMaximize: true,
    clampResizeToViewport: false,
    dragBounds: {
      allowNegativeX: true,
      minVisibleWidth: 120,
      bottomMargin: 50,
    },
  });

  const previewUrdf = useMemo(() => {
    if (!file) return null;

    try {
      if (file.format === 'urdf') {
        return file.content;
      }

      if (file.format === 'xacro') {
        const fileMap: Record<string, string> = {};
        availableFiles.forEach((candidate) => {
          fileMap[candidate.name] = candidate.content;
        });
        const pathParts = file.name.split('/');
        pathParts.pop();
        const basePath = pathParts.join('/');
        const urdfFromXacro = processXacro(file.content, {}, fileMap, basePath);
        return parseURDF(urdfFromXacro) ? urdfFromXacro : '';
      }

      if (file.format === 'mjcf') {
        const parsed = parseMJCF(file.content);
        return parsed ? generateURDF(parsed, false) : '';
      }

      if (file.format === 'usd') {
        const parsed = parseUSDA(file.content);
        return parsed ? generateURDF(parsed, false) : '';
      }

      if (file.format === 'mesh') {
        return generateURDF(buildMeshPreviewState(file), false);
      }
    } catch (error) {
      console.error('[FilePreviewWindow] Failed to build preview:', error);
    }

    return '';
  }, [file, availableFiles]);

  if (!isOpen || !file) return null;

  const fileName = file.name.split('/').pop() ?? file.name;

  return (
    <DraggableWindow
      window={windowState}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <FileCode className="w-4 h-4 text-blue-500" />
          <span className="truncate max-w-[320px]" title={file.name}>
            {t.filePreview}: {fileName}
          </span>
        </div>
      }
      className="z-[110] bg-white dark:bg-[#1E1E20] border border-slate-200 dark:border-[#3A3A3C] rounded-lg shadow-2xl flex flex-col overflow-hidden"
      headerClassName="h-11 px-3 border-b border-slate-200 dark:border-[#3A3A3C] bg-slate-50 dark:bg-[#232326] flex items-center justify-between"
      showResizeHandles
      closeTitle={t.close}
      maximizeTitle={t.expand}
      restoreTitle={t.collapse}
      minimizeTitle={t.minimize}
    >
      <div className="relative flex-1 min-h-0 bg-slate-100 dark:bg-black">
        {!previewUrdf ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{t.noPreviewImage}</span>
          </div>
        ) : (
          <URDFViewer
            urdfContent={previewUrdf}
            assets={assets}
            lang={lang}
            mode="detail"
            theme={theme}
            showToolbar={false}
            showOptionsPanel={false}
            showJointPanel={false}
          />
        )}
      </div>
    </DraggableWindow>
  );
};
