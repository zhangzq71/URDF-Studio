import type { MotorSpec } from '@/types';

import { DEFAULT_MOTOR_LIBRARY } from './motorLibrary';

export interface MotorLibraryEntryLike {
  path: string;
  content: string;
}

export interface MotorLibraryMergeResult {
  library: Record<string, MotorSpec[]>;
  parseFailures: string[];
}

function cloneMotorLibrary(library: Record<string, MotorSpec[]>): Record<string, MotorSpec[]> {
  return Object.fromEntries(
    Object.entries(library).map(([brand, entries]) => [brand, [...entries]]),
  );
}

export function mergeMotorLibraryEntries(
  entries: readonly MotorLibraryEntryLike[],
  baseLibrary: Record<string, MotorSpec[]> = DEFAULT_MOTOR_LIBRARY,
): MotorLibraryMergeResult {
  const library = cloneMotorLibrary(baseLibrary);
  const parseFailures: string[] = [];

  for (const entry of entries) {
    try {
      const parts = entry.path.split('/');
      if (parts.length < 2) {
        continue;
      }

      const brand = parts[parts.length - 2];
      const spec = JSON.parse(entry.content) as MotorSpec;
      const brandEntries = library[brand] ?? [];

      if (!brandEntries.some((motor) => motor.name === spec.name)) {
        library[brand] = [...brandEntries, spec];
      } else if (!library[brand]) {
        library[brand] = brandEntries;
      }
    } catch {
      parseFailures.push(entry.path);
    }
  }

  return {
    library,
    parseFailures,
  };
}
