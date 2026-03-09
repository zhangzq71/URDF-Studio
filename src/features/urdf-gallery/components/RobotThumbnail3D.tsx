/**
 * RobotThumbnail3D - Mini 3D preview for URDF Gallery
 * Pure real-time rendering with continuous rotation
 */

import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { URDFLoader } from '@/core/parsers/urdf/loader';
import { Box, Loader2, Image as ImageIcon } from 'lucide-react';
import { SceneLighting } from '@/shared/components/3d';
import { createLoadingManager, createMeshLoader, buildAssetIndex, resetUnitDetection } from '@/core/loaders';

interface RobotThumbnail3DProps {
  assetId: string;
  urdfFile?: string;
  theme?: 'light' | 'dark';
}

// Helper to convert DataURL to Blob
const dataURLtoBlob = (dataurl: string) => {
  const arr = dataurl.split(',');
  const match = arr[0].match(/:(.*?);/);
  const mime = match ? match[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * ThumbnailGenerator - Loads robot, positions camera, and captures screenshot
 */
function ThumbnailGenerator({ 
  files,
  urdfFile,
  onCapture
}: { 
  files: Array<{ path: string; url: string }>;
  urdfFile?: string;
  onCapture: (dataUrl: string) => void;
}) {
  const { gl, camera, scene } = useThree();
  const [robot, setRobot] = useState<THREE.Object3D | null>(null);
  const loadedRef = useRef(false);
  const robotRef = useRef<THREE.Object3D | null>(null);
  const capturedRef = useRef(false);
  const blobUrlsRef = useRef<string[]>([]);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const loadRobot = async () => {
      try {
        // 1. Find URDF file
        const targetFileObj = urdfFile 
          ? files.find(f => f.path.endsWith(urdfFile)) 
          : files.find(f => f.path.toLowerCase().endsWith('.urdf'));

        if (!targetFileObj) {
          console.error('[ThumbnailGenerator] No URDF file found');
          return;
        }

        // 2. Register assets
        const assets: Record<string, string> = {};
        files.forEach(f => {
          assets[f.path] = f.url;
          const fileName = f.path.split('/').pop();
          if (fileName && !assets[fileName]) {
            assets[fileName] = f.url;
          }
        });

        // 3. Fetch URDF content
        const urdfRes = await fetch(targetFileObj.url);
        if (!urdfRes.ok) throw new Error('Failed to fetch URDF');
        const urdfContent = await urdfRes.text();

        // 4. Setup Loader
        resetUnitDetection();
        const assetIndex = buildAssetIndex(assets, '');
        const manager = createLoadingManager(assets, '');
        const meshLoader = createMeshLoader(assets, manager, '', assetIndex);

        let pendingLoads = 0;
        const originalOnStart = manager.onStart;
        manager.onStart = (url, loaded, total) => {
          pendingLoads++;
          if (originalOnStart) originalOnStart(url, loaded, total);
        };

        const finalize = (loadedRobot: THREE.Object3D) => {
          setupRobotScene(loadedRobot, camera as THREE.PerspectiveCamera);
          
          robotRef.current = loadedRobot;
          setRobot(loadedRobot);

          // Wait a bit for rendering to settle, then capture
          setTimeout(() => {
             if (capturedRef.current) return;
             capturedRef.current = true;
             
             // Force a render before capture
             gl.render(scene, camera);
             
             const dataUrl = gl.domElement.toDataURL('image/png');
             onCapture(dataUrl);
          }, 500); 
        };

        manager.onLoad = () => {
          if (robotRef.current && !capturedRef.current) {
             finalize(robotRef.current);
          }
        };

        const loader = new URDFLoader(manager);
        loader.packages = '';
        loader.loadMeshCb = meshLoader;

        const parsedRobot = loader.parse(urdfContent);
        robotRef.current = parsedRobot;
        
        // Handle instant loads
        setTimeout(() => {
          if (!capturedRef.current) {
             // Check if we need to wait for meshes
             let hasMeshes = false;
             parsedRobot.traverse((c: any) => {
               if (c.isMesh) hasMeshes = true;
             });
             if (!hasMeshes || pendingLoads === 0) {
                manager.onLoad();
             }
          }
        }, 200);

        // Fallback
        setTimeout(() => {
          if (!capturedRef.current && robotRef.current) {
            console.warn('[ThumbnailGenerator] Force finalize after timeout');
            finalize(robotRef.current);
          }
        }, 4000);

      } catch (e) {
        console.error('[ThumbnailGenerator] Error:', e);
      }
    };

    loadRobot();
  }, [files, urdfFile, gl, camera, scene, onCapture]);

  return robot ? <primitive object={robot} /> : null;
}

// Logic to center robot and adjust camera (extracted from original)
function setupRobotScene(robot: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  // Apply material styling
  robot.traverse((child: any) => {
    if (child.isMesh) {
      if (child.material) {
        const mat = child.material;
        if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
           mat.roughness = 0.5;
           mat.metalness = 0.1;
        }
      }
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(robot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  
  const isValidBox = box.min.x !== Infinity && size.x > 0;
  
  if (!isValidBox) {
    robot.position.set(0, 0, 0);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0, 0.5);
  } else {
    // Center and place on ground
    robot.position.set(-center.x, -center.y, -box.min.z);
    
    // Use the exact camera angle as VisualizerCanvas (Isometric 2,2,2)
    // No extra robot rotation, to keep consistency with the editor view
    
    // Calculate fit distance based on bounding sphere
    const radius = size.length() / 2;
    const fov = camera.fov * (Math.PI / 180);
    const fitDistance = radius / Math.sin(fov / 2);
    
    // Adjust margin: reduced from 1.7 to 1.2 to zoom in (reducing total whitespace)
    const margin = 1.2; 
    const dist = Math.max(fitDistance * margin, 0.5);
    
    // Target: Shift center up (0.5 -> 0.6) to move robot DOWN in the frame
    // This preserves top margin while consuming bottom whitespace
    const lookAtPos = new THREE.Vector3(0, 0, size.z * 0.6);
    
    // Direction: (1, 1, 1) normalized (matches 2,2,2 vector)
    const direction = new THREE.Vector3(1, 1, 1).normalize();
    
    camera.position.copy(lookAtPos).add(direction.multiplyScalar(dist));
    camera.lookAt(lookAtPos);
  }
  camera.updateProjectionMatrix();
}

export const RobotThumbnail3D: React.FC<RobotThumbnail3DProps> = ({ assetId, urdfFile, theme = 'dark' }) => {
  const [status, setStatus] = useState<'init' | 'checking' | 'found-image' | 'generating' | 'error'>('init');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileList, setFileList] = useState<Array<{path: string, url: string}> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Lazy load
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.1, rootMargin: '50px' });
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Main logic
  useEffect(() => {
    if (!isVisible || status !== 'init' || !assetId) return;

    const checkFiles = async () => {
      setStatus('checking');
      try {
        const token = (import.meta as any).env.VITE_API_TOKEN;
        const res = await fetch('/api/download-asset', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ assetId })
        });
        
        const data = await res.json();
        if (!data.success || !data.data?.files) throw new Error('Failed to list files');
        
        const files = data.data.files;
        
        // Skip checking for existing thumbnail, always generate fresh one
        setFileList(files);
        setStatus('generating');
      } catch (err) {
        console.error('Error getting thumbnail:', err);
        setStatus('error');
      }
    };

    checkFiles();
  }, [isVisible, assetId, status]);

  const handleCapture = async (dataUrl: string) => {
    // 1. Show captured image immediately
    setImageUrl(dataUrl);
    setStatus('found-image');

    // 2. Upload in background via backend proxy (avoids CORS issues)
    try {
      const token = (import.meta as any).env.VITE_API_TOKEN;
      
      // Upload directly to backend using assetId and relative path
      const secret = import.meta.env.VITE_UPLOAD_SECRET;
      
      const res = await fetch('/api/upload-file', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
           assetId: assetId,
           relativePath: 'thumbnail.png',
           content: dataUrl,
           secret: secret || '' // Optional extra secret for admin-only upload
        })
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      console.log('Thumbnail uploaded successfully for asset:', assetId);
    } catch (e) {
      console.error('Failed to upload thumbnail:', e);
      // We still show the generated image, it just won't be persisted for next time
    }
  };

  if (status === 'error') {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center w-full h-full text-slate-400 bg-slate-50 dark:bg-slate-900">
        <Box className="w-8 h-8 opacity-30" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-slate-100 dark:bg-[#000000]">
      {/* 1. Static Image View */}
      {status === 'found-image' && imageUrl && (
        <img 
          src={imageUrl} 
          alt="Robot Preview" 
          className="w-full h-full object-cover"
        />
      )}

      {/* 2. Generating View (Hidden Canvas + Loading) */}
      {status === 'generating' && fileList && (
        <>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 dark:bg-[#000000]">
            <div className="flex flex-col items-center">
               <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
               <span className="text-xs text-slate-500">Generating Preview...</span>
            </div>
          </div>
          {/* Render Canvas offscreen with fixed large size for high res output */ }
          <div 
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              width: '1024px', 
              height: '1024px', 
              opacity: 0, 
              pointerEvents: 'none', 
              zIndex: -1 
            }}
          >
            <Canvas
              dpr={2}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              camera={{ position: [2, 2, 2], up: [0, 0, 1], fov: 60 }}
            >
              <color attach="background" args={[theme === 'light' ? '#f8f9fa' : '#000000']} />
              <SceneLighting />
              <Environment files="/potsdamer_platz_1k.hdr" environmentIntensity={1.2} />
              <ThumbnailGenerator 
                 files={fileList} 
                 urdfFile={urdfFile}
                 onCapture={handleCapture}
              />
            </Canvas>
          </div>
        </>
      )}

      {/* 3. Initial Loading */}
      {(status === 'init' || status === 'checking') && (
        <div className="flex items-center justify-center w-full h-full">
           <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
};

export default RobotThumbnail3D;

