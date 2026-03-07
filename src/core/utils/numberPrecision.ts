export const MAX_GEOMETRY_DIMENSION_DECIMALS = 5;
export const MAX_PROPERTY_DECIMALS = 7;

export const roundToMaxDecimals = (value: number, maxDecimals: number = MAX_PROPERTY_DECIMALS): number => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const rounded = Number(value.toFixed(maxDecimals));
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const formatNumberWithMaxDecimals = (
  value: number,
  maxDecimals: number = MAX_PROPERTY_DECIMALS,
): string => {
  if (!Number.isFinite(value)) {
    return '';
  }

  const rounded = roundToMaxDecimals(value, maxDecimals);
  return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
};
