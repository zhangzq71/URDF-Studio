import type { MotorSpec } from '@/types';

import {
  DEFAULT_MOTOR_LIBRARY,
  cloneMotorLibrary,
  isMotorLibraryCatalogFilePath,
  mergeMotorLibraries,
  parseMotorLibraryCatalog,
  parseMotorSpec,
} from './motorLibrary';

export interface MotorLibraryEntryLike {
  path: string;
  content: string;
}

export interface MotorLibraryMergeResult {
  library: Record<string, MotorSpec[]>;
  parseFailures: string[];
}

export function mergeMotorLibraryEntries(
  entries: readonly MotorLibraryEntryLike[],
  baseLibrary: Record<string, MotorSpec[]> = DEFAULT_MOTOR_LIBRARY,
): MotorLibraryMergeResult {
  let library = cloneMotorLibrary(baseLibrary);
  const parseFailures: string[] = [];

  for (const entry of entries) {
    try {
      if (isMotorLibraryCatalogFilePath(entry.path)) {
        const parsedLibrary = parseMotorLibraryCatalog(JSON.parse(entry.content), entry.path);
        library = mergeMotorLibraries(library, parsedLibrary);
        continue;
      }

      const parts = entry.path.split('/');
      if (parts.length < 2) {
        continue;
      }

      const brand = parts[parts.length - 2];
      const spec = parseMotorSpec(JSON.parse(entry.content), entry.path);
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
