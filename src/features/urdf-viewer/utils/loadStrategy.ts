export function shouldMountRobotBeforeAssetsComplete(sourceFormat: 'urdf' | 'mjcf'): boolean {
  return sourceFormat === 'urdf';
}
