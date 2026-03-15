import React from 'react';
import { Box } from 'lucide-react';
import { RobotThumbnail3D } from './RobotThumbnail3D';
import type { RobotModel } from '../types';

interface GalleryRobotThumbnailProps {
  model: RobotModel;
  theme?: 'light' | 'dark';
  placeholderLabel: string;
}

export const GalleryRobotThumbnail: React.FC<GalleryRobotThumbnailProps> = ({
  model,
  theme,
  placeholderLabel,
}) => {
  if (model.sourceType === 'server' && model.urdfPath && !model.urdfPath.startsWith('http')) {
    return (
      <RobotThumbnail3D
        urdfPath={model.urdfPath}
        urdfFile={model.urdfFile}
        theme={theme}
        fallbackLabel={placeholderLabel}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-tertiary">
      <Box className="h-10 w-10 opacity-40" />
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] opacity-60">
        {placeholderLabel}
      </span>
    </div>
  );
};

export default GalleryRobotThumbnail;
