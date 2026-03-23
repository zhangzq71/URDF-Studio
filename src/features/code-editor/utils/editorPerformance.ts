export const getUrdfValidationDebounceMs = (codeLength: number): number => {
  if (codeLength <= 2_000) {
    return 120;
  }

  if (codeLength <= 15_000) {
    return 180;
  }

  return 320;
};
