import React from 'react';
import { ArrowUpRight, Clock, Download, Star, User } from 'lucide-react';
import { translations } from '@/shared/i18n';
import { getCategoryName, getLocalizedModelContent } from '../data/galleryModels';
import { GalleryRobotThumbnail } from './GalleryRobotThumbnail';
import type { RobotModel } from '../types';

interface GalleryModelCardProps {
  model: RobotModel;
  lang: 'en' | 'zh';
  theme: 'light' | 'dark';
  onOpen: (model: RobotModel) => void;
  onImport: (model: RobotModel) => void | Promise<void>;
}

export const GalleryModelCard: React.FC<GalleryModelCardProps> = ({
  model,
  lang,
  theme,
  onOpen,
  onImport,
}) => {
  const t = translations[lang];
  const localized = getLocalizedModelContent(model, lang);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(model)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(model);
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border-black bg-panel-bg shadow-sm transition-all hover:border-system-blue hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
    >
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-element-bg">
        <GalleryRobotThumbnail
          model={model}
          theme={theme}
          placeholderLabel={t.preview}
        />

        <div className="absolute left-2 top-2 flex gap-1">
          <span className="rounded-full border border-border-black bg-panel-bg px-2 py-0.5 text-[9px] font-semibold text-text-primary shadow-sm">
            {getCategoryName(model.category, t)}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-black/5 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(event) => {
              event.stopPropagation();
              void onImport(model);
            }}
            className="pointer-events-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-system-blue-solid py-2 text-xs font-semibold text-white transition-colors hover:bg-system-blue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
          >
            <Download className="h-3.5 w-3.5" />
            {t.importNow}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight text-text-primary transition-colors group-hover:text-system-blue">
            {localized.name}
          </h3>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary transition-colors group-hover:text-system-blue" />
        </div>

        <div className="mb-2 flex items-center gap-1 text-[10px] text-text-tertiary">
          <User className="h-3 w-3" />
          <span>{model.author}</span>
        </div>

        <p className="mb-3 line-clamp-2 flex-1 text-xs text-text-secondary">
          {localized.description}
        </p>

        <div className="mb-3 flex flex-wrap gap-1">
          {localized.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-element-bg px-1.5 py-0.5 text-[9px] text-text-secondary"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border-black pt-2 text-[10px] text-text-tertiary">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              <span>{model.stars}</span>
            </div>
            <div className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <span>{model.downloads}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{model.lastUpdated}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GalleryModelCard;
