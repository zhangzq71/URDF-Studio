import { LoadingHud } from '@/shared/components/3d';

interface ImportPreparationOverlayProps {
  label: string;
  detail?: string;
}

export function ImportPreparationOverlay({
  label,
  detail,
}: ImportPreparationOverlayProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex justify-end px-4">
      <LoadingHud
        title={label}
        detail={detail?.trim() ?? ''}
        progress={null}
        delayMs={0}
      />
    </div>
  );
}
