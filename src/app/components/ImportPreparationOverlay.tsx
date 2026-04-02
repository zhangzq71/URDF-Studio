import { LoadingHud } from '@/shared/components/3d';

interface ImportPreparationOverlayProps {
  label: string;
  detail?: string;
  progress?: number | null;
  statusLabel?: string | null;
  stageLabel?: string | null;
}

export function ImportPreparationOverlay({
  label,
  detail,
  progress = null,
  statusLabel = null,
  stageLabel = null,
}: ImportPreparationOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex justify-end px-4">
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
