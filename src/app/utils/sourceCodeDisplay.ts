import type { RobotFile } from '../../types/robot.ts';
import type { SourceCodeDocumentFlavor } from '@/features/code-editor/types';

export type { SourceCodeDocumentFlavor } from '@/features/code-editor/types';

type SourceCodeFileLike = Pick<RobotFile, 'name' | 'format' | 'content'>;

export function shouldUseEquivalentMjcfForUsdSource(
  file: SourceCodeFileLike | null | undefined,
): boolean {
  return Boolean(file && file.format === 'usd');
}

export function getSourceCodeDocumentFlavor(
  file: SourceCodeFileLike | null | undefined,
): SourceCodeDocumentFlavor {
  if (!file) {
    return 'urdf';
  }

  if (file.format === 'mjcf') {
    return 'mjcf';
  }

  if (file.format === 'xacro') {
    return 'xacro';
  }

  if (shouldUseEquivalentMjcfForUsdSource(file)) {
    return 'equivalent-mjcf';
  }

  if (file.format === 'usd') {
    return 'usd';
  }

  return 'urdf';
}

export function isSourceCodeDocumentReadOnly(
  documentFlavor: SourceCodeDocumentFlavor,
): boolean {
  return documentFlavor === 'usd' || documentFlavor === 'equivalent-mjcf';
}
