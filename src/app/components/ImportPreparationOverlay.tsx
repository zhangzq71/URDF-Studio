import { LoadingHud } from '@/shared/components/3d';

type ImportPreparationOverlayPlacement = 'viewport' | 'viewer-corner';

interface ImportPreparationOverlayProps {
  label: string;
  detail?: string;
  progress?: number | null;
  statusLabel?: string | null;
  stageLabel?: string | null;
  placement?: ImportPreparationOverlayPlacement;
}

export function ImportPreparationOverlay({
  label,
  detail,
  progress = null,
  statusLabel = null,
  stageLabel = null,
  placement = 'viewport',
}: ImportPreparationOverlayProps) {
  const wrapperClassName =
    placement === 'viewer-corner'
      ? 'pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-4'
      : 'pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex justify-end px-4';

  return (
    <div className={wrapperClassName}>
      <LoadingHud
        title={label}
        detail={detail?.trim() ?? ''}
        progress={progress}
        statusLabel={statusLabel}
        stageLabel={stageLabel}
        delayMs={0}
      />
    </div>
  );
}
