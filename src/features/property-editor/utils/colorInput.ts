import { parseThreeColorWithOpacity } from '@/core/utils/color.ts';

function clampOpacityToHex(opacity: number): string {
  const channel = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  return channel.toString(16).padStart(2, '0');
}

export function getColorPickerHexValue(
  value?: string | null,
  fallback = '#ffffff',
): string {
  const parsed = parseThreeColorWithOpacity(value) || parseThreeColorWithOpacity(fallback);
  return parsed ? `#${parsed.color.getHexString()}` : '#ffffff';
}

export function mergeColorPickerHexValue(
  nextPickerValue: string,
  previousColor?: string | null,
): string {
  const nextHex = getColorPickerHexValue(nextPickerValue);
  const previousParsed = parseThreeColorWithOpacity(previousColor);

  if (previousParsed?.opacity == null) {
    return nextHex;
  }

  return `${nextHex}${clampOpacityToHex(previousParsed.opacity)}`;
}
