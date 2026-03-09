/**
 * RobotPreview - Smart preview component
 * Uses pre-recorded animated WebP if available, falls back to 3D rendering
 * This significantly reduces CPU/GPU usage for the URDF Gallery
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Loader2 } from 'lucide-react';
import { RobotThumbnail3D } from './RobotThumbnail3D';

// Cache for signed URLs to avoid repeated requests during filtering
// Key: assetId_type, Value: { url: string, expiry: timestamp }
const urlCache = new Map<string, { url: string; expiry: number }>();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes cache

interface RobotPreviewProps {
  modelId: string;
  urdfFile?: string;
  theme?: 'light' | 'dark';
  fallbackLabel?: string;
}

/**
 * RobotPreview - Tries to load animated preview first, falls back to 3D
 */
export const RobotPreview: React.FC<RobotPreviewProps> = ({ 
  modelId,
  urdfFile,
  theme = 'dark',
  fallbackLabel = 'Preview'
}) => {
  // If no model ID, just show label or fallback (though modelId is required)
  if (!modelId) return null;

  const [previewType, setPreviewType] = useState<'loading' | 'animated' | '3d'>('loading');
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Check for pre-recorded animation (thumbnail) when visible
  useEffect(() => {
    if (!isVisible) return;
    
    // Reset state when modelId changes
    setPreviewType('loading');

    const checkForAnimation = async () => {
      // 1. Check Cache first
      const cacheKey = `${modelId}_thumbnail`;
      const cached = urlCache.get(cacheKey);
      if (cached && Date.now() < cached.expiry) {
        setAnimationUrl(cached.url);
        setPreviewType('animated');
        return;
      }

      // 2. Handle Cloud Storage via API
      try {
        const token = (import.meta as any).env.VITE_API_TOKEN;
        const response = await fetch('/api/get-signed-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ assetId: modelId, fileType: 'thumbnail' }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.url) {
            // Save to cache
            urlCache.set(cacheKey, {
              url: result.data.url,
              expiry: Date.now() + CACHE_DURATION
            });

            setAnimationUrl(result.data.url);
            setIsImageLoaded(false);
            setPreviewType('animated');
            return;
          }
        }
      } catch (e) {
        console.error('[RobotPreview] Failed to check cloud animation:', e);
      }
      
      // 3. Fallback to 3D rendering if thumbnail fetch fails
      setPreviewType('3d');
    };

    checkForAnimation();
  }, [modelId, isVisible]);

  // Loading state
  if (!isVisible || previewType === 'loading') {
    return (
      <div 
        ref={containerRef} 
        className="flex items-center justify-center w-full h-full"
        style={{ backgroundColor: theme === 'light' ? '#f8f9fa' : '#000000' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Animated preview (WebP)
  if (previewType === 'animated' && animationUrl) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden relative"
        style={{ backgroundColor: theme === 'light' ? '#f8f9fa' : '#000000' }}
      >
        {!isImageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}
        <img 
          src={animationUrl}
          alt={`${modelId} preview`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setIsImageLoaded(true)}
          onError={() => {
            // If image fails to load, fallback to 3D view
            setPreviewType('3d');
          }}
        />
      </div>
    );
  }

  // 3D fallback
  return (
    <div ref={containerRef} className="w-full h-full">
      <RobotThumbnail3D 
        assetId={modelId}
        urdfFile={urdfFile}
        theme={theme}
      />
    </div>
  );
};

export default RobotPreview;
