import React from 'react';
import {
  ArrowLeft,
  Clock,
  Download,
  FileCode2,
  FolderTree,
  Layers3,
  Package,
  Star,
  Tag,
  User,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { translations } from '@/shared/i18n';
import {
  getCategoryName,
  getLocalizedModelContent,
  getRecommendedModeLabels,
} from '../data/galleryModels';
import { GalleryRobotThumbnail } from './GalleryRobotThumbnail';
import type { GalleryDetailTab, RobotModel } from '../types';

interface GalleryModelDetailProps {
  model: RobotModel;
  relatedModels: RobotModel[];
  lang: 'en' | 'zh';
  theme: 'light' | 'dark';
  activeTab: GalleryDetailTab;
  onTabChange: (tab: GalleryDetailTab) => void;
  onBack: () => void;
  onImport: (model: RobotModel) => void | Promise<void>;
  onSelectModel: (model: RobotModel) => void;
}

export const GalleryModelDetail: React.FC<GalleryModelDetailProps> = ({
  model,
  relatedModels,
  lang,
  theme,
  activeTab,
  onTabChange,
  onBack,
  onImport,
  onSelectModel,
}) => {
  const t = translations[lang];
  const localized = getLocalizedModelContent(model, lang);
  const recommendedModes = getRecommendedModeLabels(model.recommendedModes, t);

  const detailTabOptions = [
    { value: 'overview' as const, label: t.galleryOverview },
    { value: 'specs' as const, label: t.gallerySpecs },
    { value: 'resources' as const, label: t.galleryResources },
  ];

  const quickFacts = [
    { label: t.galleryModelCategory, value: getCategoryName(model.category, t), icon: Layers3 },
    { label: t.galleryPublisher, value: model.author, icon: User },
    { label: t.galleryUpdatedAt, value: model.lastUpdated, icon: Clock },
    {
      label: t.gallerySource,
      value: model.sourceType === 'server' ? t.galleryLocalLibrary : t.galleryRemoteRepository,
      icon: Package,
    },
    { label: t.galleryPackagePath, value: model.urdfPath ?? '-', icon: FolderTree },
    {
      label: t.galleryPreferredEntry,
      value: model.urdfFile ?? t.galleryEntryAutoDetect,
      icon: FileCode2,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-element-bg hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.galleryBackToList}
        </button>
        <span className="rounded-full border border-border-black bg-element-bg px-2 py-1 text-[10px] font-semibold text-text-secondary">
          {getCategoryName(model.category, t)}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card padding="none" className="overflow-hidden">
          <div className="relative flex min-h-[300px] items-center justify-center bg-element-bg">
            <GalleryRobotThumbnail
              model={model}
              theme={theme}
              placeholderLabel={t.preview}
            />
          </div>

          <div className="grid gap-px border-t border-border-black bg-border-black sm:grid-cols-3">
            <div className="bg-panel-bg px-4 py-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                <Star className="h-3 w-3" />
                {t.featuredModels}
              </div>
              <div className="text-sm font-semibold text-text-primary">{model.stars}</div>
            </div>
            <div className="bg-panel-bg px-4 py-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                <Download className="h-3 w-3" />
                {t.importNow}
              </div>
              <div className="text-sm font-semibold text-text-primary">{model.downloads}</div>
            </div>
            <div className="bg-panel-bg px-4 py-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                <Clock className="h-3 w-3" />
                {t.galleryUpdatedAt}
              </div>
              <div className="text-sm font-semibold text-text-primary">{model.lastUpdated}</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-system-blue">
              <Star className="h-3.5 w-3.5 fill-current" />
              <span>{t.galleryDetails}</span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-text-primary">{localized.name}</h2>
              <div className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
                <User className="h-4 w-4" />
                <span>{model.author}</span>
              </div>
            </div>
            <p className="text-sm leading-6 text-text-secondary">{localized.description}</p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              {t.galleryRecommendedModes}
            </div>
            <div className="flex flex-wrap gap-2">
              {recommendedModes.map((mode) => (
                <span
                  key={mode}
                  className="rounded-full border border-system-blue/20 bg-system-blue/10 px-2.5 py-1 text-[11px] font-medium text-system-blue"
                >
                  {mode}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              {t.tags}
            </div>
            <div className="flex flex-wrap gap-2">
              {localized.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-element-bg px-2.5 py-1 text-[11px] text-text-secondary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => void onImport(model)}
              icon={<Download className="h-4 w-4" />}
            >
              {t.galleryImportToWorkspace}
            </Button>
            <Button variant="secondary" onClick={onBack}>
              {t.galleryBrowseMore}
            </Button>
          </div>
        </Card>
      </div>

      <SegmentedControl
        options={detailTabOptions}
        value={activeTab}
        onChange={onTabChange}
        className="w-full max-w-[420px]"
      />

      {activeTab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <div className="text-sm font-semibold text-text-primary">{t.galleryOverview}</div>
            <p className="text-sm leading-6 text-text-secondary">{localized.overview}</p>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold text-text-primary">{t.galleryHighlights}</div>
            <ul className="space-y-2">
              {localized.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-system-blue" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold text-text-primary">{t.galleryBestFor}</div>
            <ul className="space-y-2">
              {localized.bestFor.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-system-blue" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold text-text-primary">{t.galleryModelInfo}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-element-bg p-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                  {t.galleryModelCategory}
                </div>
                <div className="text-sm font-medium text-text-primary">
                  {getCategoryName(model.category, t)}
                </div>
              </div>
              <div className="rounded-xl bg-element-bg p-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                  {t.galleryPublisher}
                </div>
                <div className="text-sm font-medium text-text-primary">{model.author}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'specs' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickFacts.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-tertiary">
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </div>
              <div className="break-all text-sm font-medium text-text-primary">{value}</div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Package className="h-4 w-4 text-system-blue" />
              {t.galleryAssetBundle}
            </div>
            <ul className="space-y-2">
              {localized.assetBundle.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-system-blue" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <FolderTree className="h-4 w-4 text-system-blue" />
                {t.galleryModelResources}
              </div>
              <div className="rounded-xl bg-element-bg p-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                  {t.galleryPackagePath}
                </div>
                <div className="break-all font-mono text-xs text-text-primary">
                  {model.urdfPath ?? '-'}
                </div>
              </div>
              <div className="rounded-xl bg-element-bg p-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                  {t.galleryPreferredEntry}
                </div>
                <div className="break-all font-mono text-xs text-text-primary">
                  {model.urdfFile ?? t.galleryEntryAutoDetect}
                </div>
              </div>
              <div className="rounded-xl bg-element-bg p-3">
                <div className="mb-2 flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                  <Tag className="h-3 w-3" />
                  {t.tags}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {localized.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-panel-bg px-2 py-1 text-[11px] text-text-secondary"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {relatedModels.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-primary">
              {t.galleryRelatedModels}
            </div>
            <div className="text-xs text-text-tertiary">
              {getCategoryName(model.category, t)}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {relatedModels.map((relatedModel) => {
              const relatedLocalized = getLocalizedModelContent(relatedModel, lang);

              return (
                <button
                  key={relatedModel.id}
                  onClick={() => onSelectModel(relatedModel)}
                  className="rounded-xl border border-border-black bg-element-bg p-3 text-left transition-colors hover:border-system-blue hover:bg-element-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-system-blue/30"
                >
                  <div className="mb-1 text-sm font-semibold text-text-primary">
                    {relatedLocalized.name}
                  </div>
                  <div className="mb-2 line-clamp-2 text-xs text-text-secondary">
                    {relatedLocalized.description}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-tertiary">
                    <span>{getCategoryName(relatedModel.category, t)}</span>
                    <span>{relatedModel.lastUpdated}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GalleryModelDetail;
