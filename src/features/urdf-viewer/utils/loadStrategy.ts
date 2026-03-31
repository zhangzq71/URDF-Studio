export function shouldMountRobotBeforeAssetsComplete(sourceFormat: 'urdf' | 'mjcf'): boolean {
  void sourceFormat;
  return false;
}

export function shouldForceViewerRuntimeRemount(
  sourceFormat: 'urdf' | 'mjcf' | 'usd' | 'xacro' | 'sdf' | 'mesh' | null | undefined,
): boolean {
  return sourceFormat === 'usd';
}
