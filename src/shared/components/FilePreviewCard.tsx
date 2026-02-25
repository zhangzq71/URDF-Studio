import React, { useMemo } from 'react';
import { Box } from 'lucide-react';
import type { RobotFile } from '@/types';

const PREVIEW_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'];

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '');
}

function getAssetUrl(key: string, assets: Record<string, string>): string | null {
  if (assets[key]) return assets[key];

  const normalized = normalizePath(key);
  if (assets[normalized]) return assets[normalized];

  const leadingSlash = `/${normalized}`;
  if (assets[leadingSlash]) return assets[leadingSlash];

  return null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildPreviewCandidates(file: RobotFile): string[] {
  const normalizedPath = normalizePath(file.name);
  const parts = normalizedPath.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1] ?? '';
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const folder = parts.slice(0, -1).join('/');
  const parentFolder = parts.slice(0, -2).join('/');

  const candidates: string[] = [];

  const appendCandidates = (folderPath: string) => {
    if (!folderPath) return;
    PREVIEW_IMAGE_EXTENSIONS.forEach((ext) => {
      candidates.push(`${folderPath}/preview.${ext}`);
      candidates.push(`${folderPath}/thumbnail.${ext}`);
      candidates.push(`${folderPath}/${baseName}.${ext}`);
    });
  };

  appendCandidates(folder);
  appendCandidates(parentFolder);

  PREVIEW_IMAGE_EXTENSIONS.forEach((ext) => {
    candidates.push(`preview.${ext}`);
    candidates.push(`thumbnail.${ext}`);
  });

  return uniqueStrings(candidates);
}

export interface FilePreviewCardProps {
  file: RobotFile | null;
  assets: Record<string, string>;
  title: string;
  emptyText: string;
  noPreviewText: string;
}

export const FilePreviewCard: React.FC<FilePreviewCardProps> = ({
  file,
  assets,
  title,
  emptyText,
  noPreviewText,
}) => {
  const previewUrl = useMemo(() => {
    if (!file) return null;
    const candidates = buildPreviewCandidates(file);
    for (const candidate of candidates) {
      const url = getAssetUrl(candidate, assets);
      if (url) return url;
    }
    return null;
  }, [file, assets]);

  const shortName = file?.name.split('/').pop() ?? '';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-google-dark-border bg-slate-50 dark:bg-[#111113] overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-google-dark-border bg-white dark:bg-[#1A1A1D]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
      </div>

      <div className="p-3">
        <div className="w-full aspect-[16/10] rounded-md border border-slate-200 dark:border-[#2F2F34] bg-white dark:bg-[#0B0B0D] overflow-hidden flex items-center justify-center">
          {previewUrl ? (
            <img src={previewUrl} alt={`${shortName} preview`} className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-3 text-center">
              <Box className="w-6 h-6 text-slate-400" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {file ? noPreviewText : emptyText}
              </span>
            </div>
          )}
        </div>

        {file && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300 truncate" title={file.name}>
              {shortName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#2E2E33] text-slate-600 dark:text-slate-300 font-semibold">
              {file.format.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
