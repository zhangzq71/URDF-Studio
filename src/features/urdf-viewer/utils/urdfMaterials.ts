import * as THREE from 'three';

// ============================================================
// URDF Material Parser - Extract rgba colors from URDF XML
// Supports multiple materials per visual (for DAE files with named materials)
// ============================================================
export interface URDFMaterialInfo {
    name?: string;
    rgba?: [number, number, number, number];
}

/**
 * Parse URDF materials - returns a Map keyed by material NAME (not link name)
 * This allows matching materials in DAE files by their name
 */
export function parseURDFMaterials(urdfContent: string): Map<string, THREE.Material> {
  const materials = new Map<string, THREE.Material>();
  const namedMaterials = new Map<string, URDFMaterialInfo>();
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(urdfContent, 'text/xml');

    // First pass: collect global materials (defined at robot level)
    const robotMaterials = doc.querySelectorAll('robot > material');
    robotMaterials.forEach(matEl => {
      const name = matEl.getAttribute('name');
      if (name) {
        const colorEl = matEl.querySelector('color');
        if (colorEl) {
          const rgbaStr = colorEl.getAttribute('rgba');
          if (rgbaStr) {
            const parts = rgbaStr.trim().split(/\s+/).map(Number);
            if (parts.length >= 3) {
              namedMaterials.set(name, {
                name,
                rgba: [parts[0], parts[1], parts[2], parts[3] ?? 1]
              });
            }
          }
        }
      }
    });

    // Second pass: get ALL materials from each link's visual elements
    // This handles DAE files where each visual can have multiple named materials
    const links = doc.querySelectorAll('link');
    links.forEach(linkEl => {
      const linkName = linkEl.getAttribute('name');
      if (!linkName) return;

      // Get ALL visual elements (not just first)
      const visualEls = linkEl.querySelectorAll('visual');
      visualEls.forEach(visualEl => {
        // Get ALL material elements in this visual (not just first)
        const matEls = visualEl.querySelectorAll('material');
        matEls.forEach(matEl => {
          const matName = matEl.getAttribute('name');
          if (!matName) return;

          const colorEl = matEl.querySelector('color');
          if (colorEl) {
            const rgbaStr = colorEl.getAttribute('rgba');
            if (rgbaStr) {
              const parts = rgbaStr.trim().split(/\s+/).map(Number);
              if (parts.length >= 3) {
                const rgba: [number, number, number, number] = [parts[0], parts[1], parts[2], parts[3] ?? 1];
                namedMaterials.set(matName, {
                  name: matName,
                  rgba
                });
              }
            }
          }
        });
      });
    });

    // Convert URDFMaterialInfo to THREE.Material
    namedMaterials.forEach((info, name) => {
      if (info.rgba) {
        const [r, g, b, a] = info.rgba;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(r, g, b),
          transparent: a < 1,
          opacity: a,
        });
        mat.name = name;
        materials.set(name, mat);
      }
    });

  } catch (error) {
    // Silently handle parse errors
  }

  return materials;
}

/**
 * Apply URDF materials to robot model by matching material NAMES
 * This works with DAE files where materials have specific names like "深色橡胶_005-effect"
 */
export function applyURDFMaterials(robot: THREE.Object3D, materials: Map<string, THREE.Material>) {
  if (materials.size === 0) return;

  robot.traverse((child: any) => {
    if (!child.isMesh) return;

    // Process each material on this mesh
    const processMaterial = (mat: THREE.Material): THREE.Material => {
      // Try to match by material name
      const matName = mat.name;
      const urdfMat = materials.get(matName);

      if (urdfMat) {
        const cloned = urdfMat.clone();
        cloned.userData.urdfColorApplied = true;
        if ((urdfMat as THREE.MeshStandardMaterial).color) {
          cloned.userData.urdfColor = (urdfMat as THREE.MeshStandardMaterial).color.clone();
        }
        cloned.needsUpdate = true;
        return cloned;
      }

      return mat;
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map(processMaterial);
    } else if (child.material) {
      child.material = processMaterial(child.material);
    }
  });
}
