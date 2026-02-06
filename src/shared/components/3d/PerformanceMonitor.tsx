import React, { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useUIStore } from '@/store';

export function PerformanceMonitor() {
  const showFPS = useUIStore((state) => state.viewOptions.showFPS);
  const showMemory = useUIStore((state) => state.viewOptions.showMemory);

  if (!showFPS && !showMemory) return null;

  return <PerformanceDisplay showFPS={showFPS} showMemory={showMemory} />;
}

function PerformanceDisplay({ showFPS, showMemory }: { showFPS: boolean; showMemory: boolean }) {
  const [stats, setStats] = useState({ fps: 0, gpu: 0 });
  
  // Refs for calculations
  const frameCount = useRef(0);
  const lastUpdate = useRef(0);

  useFrame(() => {
    const time = performance.now();
    frameCount.current++;

    // Update every 500ms
    if (time - lastUpdate.current >= 500) {
      const delta = time - lastUpdate.current;
      const fps = Math.round((frameCount.current * 1000) / delta);
      
      // Calculate estimated GPU/CPU load based on frame budget (16.67ms for 60fps)
      const avgFrameTime = delta / frameCount.current;
      const gpuLoad = Math.min(100, Math.round((avgFrameTime / 16.667) * 100));

      setStats({ fps, gpu: gpuLoad });

      lastUpdate.current = time;
      frameCount.current = 0;
    }
  });

  // Style matches the "Detail Mode" label in URDFViewer
  const badgeClass = "text-slate-500 dark:text-slate-400 text-xs bg-white/50 dark:bg-[#1f1f1f]/50 backdrop-blur px-2 py-1 rounded border border-slate-200 dark:border-black/20 tabular-nums shadow-sm";

  return (
    <Html fullscreen className="pointer-events-none" style={{ zIndex: 900 }}>
      <div className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-none select-none">
        {showFPS && (
          <div className={badgeClass}>
            <span className="font-medium">{stats.fps}</span> FPS
          </div>
        )}
        
        {showMemory && (
          <div className={badgeClass}>
            GPU <span className="font-medium">{stats.gpu}%</span>
          </div>
        )}
      </div>
    </Html>
  );
}

function getFPSColor(fps: number) {
  if (fps >= 50) return 'text-green-400';
  if (fps >= 30) return 'text-yellow-400';
  return 'text-red-400';
}

function formatNumber(num: number) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}
