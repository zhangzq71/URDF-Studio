/**
 * STL Compressor - Public API
 *
 * Entry point for the stl-compressor core module.
 * All functions are pure and have no React/UI dependencies.
 */

export type { STLMeshData, BoundingBox, CompressOptions, CompressResult } from './types';
export { parseSTL, serializeToBinarySTL } from './stlParser';
export { compressMesh } from './meshCompressor';

import { parseSTL, serializeToBinarySTL } from './stlParser';
import { compressMesh } from './meshCompressor';
import type { CompressOptions, CompressResult } from './types';

/**
 * High-level helper: take an STL Blob, compress it, and return a new Blob
 * together with compression statistics.
 *
 * Only STL files are processed; non-STL blobs (e.g. DAE, OBJ) are returned
 * unchanged with a compressionRatio of 0.
 *
 * @param blob     - Original mesh file as a Blob
 * @param filename - File name (used for format detection)
 * @param options  - Compression options (quality: 10–100)
 */
export async function compressSTLBlob(
  blob: Blob,
  filename: string,
  options: CompressOptions,
): Promise<CompressResult> {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext !== 'stl') {
    // Non-STL mesh: pass through unchanged
    return {
      blob,
      originalTriangleCount: 0,
      compressedTriangleCount: 0,
      originalSize: blob.size,
      compressedSize: blob.size,
      compressionRatio: 0,
    };
  }

  const arrayBuffer = await blob.arrayBuffer();
  const meshData = parseSTL(arrayBuffer, filename);
  const compressed = compressMesh(meshData, options.quality);
  const outputBuffer = serializeToBinarySTL(compressed);
  const outputBlob = new Blob([outputBuffer], { type: 'application/octet-stream' });

  return {
    blob: outputBlob,
    originalTriangleCount: meshData.triangleCount,
    compressedTriangleCount: compressed.triangleCount,
    originalSize: blob.size,
    compressedSize: outputBlob.size,
    compressionRatio: compressed.compressionRatio ?? 0,
  };
}
