'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

// Dynamic imports to avoid SSR issues
let cornerstone: typeof import('cornerstone-core') | undefined;
let cornerstoneWADOImageLoader: typeof import('cornerstone-wado-image-loader') | undefined;
let dicomParser: typeof import('dicom-parser') | undefined;

interface DicomViewerProps {
  dicomFiles: string[];
  seriesName?: string;
}

export default function DicomViewer({ dicomFiles, seriesName = 'DICOM_Series' }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const initializeCornerstone = async () => {
      try {
        // Only load libraries in the browser
        if (typeof window !== 'undefined' && !cornerstone) {
          const [
            cornerstoneModule,
            cornerstoneWADOImageLoaderModule,
            dicomParserModule
          ] = await Promise.all([
            import('cornerstone-core'),
            import('cornerstone-wado-image-loader'),
            import('dicom-parser')
          ]);

          cornerstone = cornerstoneModule.default || cornerstoneModule;
          cornerstoneWADOImageLoader = cornerstoneWADOImageLoaderModule.default || cornerstoneWADOImageLoaderModule;
          dicomParser = dicomParserModule.default || dicomParserModule;

          cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
          cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

          cornerstoneWADOImageLoader.configure({
            useWebWorkers: true,
            decodeConfig: {
              convertFloatPixelDataToInt: false,
              use16BitDataType: true
            }
          });

          if (elementRef.current) {
            cornerstone.enable(elementRef.current);
            setIsInitialized(true);
          }
        }
      } catch (error) {
        console.error('Failed to initialize Cornerstone:', error);
      }
    };

    initializeCornerstone();

    return () => {
      const element = elementRef.current;
      if (element && cornerstone) {
        try {
          cornerstone.disable(element);
        } catch (error) {
          console.warn('Failed to disable cornerstone element:', error);
        }
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (dicomFiles.length > 0) {
      const ids = dicomFiles.map(file => `wadouri:${file}`);
      setImageIds(ids);
    }
  }, [dicomFiles]);

  const loadImage = useCallback(async (index: number) => {
    if (!elementRef.current || !imageIds[index] || !cornerstone) return;

    try {
      const image = await cornerstone.loadImage(imageIds[index]);
      cornerstone.displayImage(elementRef.current, image);

      const enabledElement = cornerstone.getEnabledElement(elementRef.current);
      const viewport = enabledElement.viewport;

      const canvas = enabledElement.canvas;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const imageWidth = image.width;
      const imageHeight = image.height;

      const scaleX = canvasWidth / imageWidth;
      const scaleY = canvasHeight / imageHeight;
      const scale = Math.min(scaleX, scaleY);

      cornerstone.setViewport(elementRef.current, {
        ...viewport,
        scale: scale,
        translation: { x: 0, y: 0 },
        voi: {
          windowCenter: image.windowCenter || viewport.voi.windowCenter,
          windowWidth: image.windowWidth || viewport.voi.windowWidth
        }
      });
    } catch (error) {
      console.error('Failed to load DICOM image:', error);
    }
  }, [imageIds]);

  useEffect(() => {
    if (isInitialized && imageIds.length > 0 && elementRef.current) {
      loadImage(currentImageIndex);
    }
  }, [isInitialized, imageIds, currentImageIndex, loadImage]);

  useEffect(() => {
    const handleResize = () => {
      if (elementRef.current && cornerstone && isInitialized && !isResizing) {
        setIsResizing(true);

        // Use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          try {
            if (cornerstone && elementRef.current) {
              // Force a slight delay to ensure DOM has updated
              setTimeout(() => {
                if (cornerstone && elementRef.current) {
                  cornerstone.resize(elementRef.current);
                  // Reload current image to ensure proper display
                  if (imageIds.length > 0) {
                    loadImage(currentImageIndex);
                  }
                }
                setIsResizing(false);
              }, 50);
            }
          } catch (error) {
            console.warn('Resize error:', error);
            setIsResizing(false);
          }
        });
      }
    };

    // Handle orientation change specifically for mobile
    const handleOrientationChange = () => {
      // Wait for orientation change to complete
      setTimeout(handleResize, 200);
    };

    // Use debounced resize handler
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Also listen for viewport changes (important for mobile)
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleMediaChange = () => {
      setTimeout(handleResize, 100);
    };

    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      mediaQuery.removeEventListener('change', handleMediaChange);
      clearTimeout(resizeTimeout);
    };
  }, [isInitialized, imageIds.length, currentImageIndex, loadImage, isResizing]);

  // Playback interval effect
  useEffect(() => {
    if (isPlaying && imageIds.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentImageIndex(prev => {
          const next = prev + 1;
          if (next >= imageIds.length) {
            return 0; // Loop back to start
          }
          return next;
        });
      }, 1000 / playSpeed);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, imageIds.length]);

  // Auto-play effect - start once when images are loaded
  useEffect(() => {
    if (isInitialized && imageIds.length > 1 && !isPlaying) {
      // Start auto-play after a brief delay
      const autoPlayTimer = setTimeout(() => {
        setIsPlaying(true);
      }, 500); // 500ms delay before starting auto-play

      return () => {
        clearTimeout(autoPlayTimer);
      };
    }
  }, [isInitialized, imageIds.length]);

  const nextImage = useCallback(() => {
    if (currentImageIndex < imageIds.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  }, [currentImageIndex, imageIds.length]);

  const prevImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  }, [currentImageIndex]);

  const goToImage = useCallback((index: number) => {
    if (index >= 0 && index < imageIds.length) {
      setCurrentImageIndex(index);
    }
  }, [imageIds.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (isPlaying) return; // Disable keyboard controls during playback

      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          prevImage();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          nextImage();
          break;
        case 'Home':
          event.preventDefault();
          goToImage(0);
          break;
        case 'End':
          event.preventDefault();
          goToImage(imageIds.length - 1);
          break;
        case ' ':
          event.preventDefault();
          const jumpSize = Math.max(1, Math.floor(imageIds.length / 50));
          goToImage(Math.min(imageIds.length - 1, currentImageIndex + jumpSize));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentImageIndex, imageIds.length, isPlaying, goToImage, nextImage, prevImage]);


  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const changePlaySpeed = (speed: number) => {
    setPlaySpeed(speed);
  };


  return (
    <div className="w-full h-full flex flex-col bg-neutral-950">
      <div className="flex-1 bg-black relative min-h-0 rounded-lg overflow-hidden">
        <div
          ref={elementRef}
          className="w-full h-full"
          style={{ minHeight: '200px' }}
        />
      </div>

      <div className="bg-neutral-900/80 backdrop-blur-sm text-neutral-100 p-2 border-t border-neutral-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center">
            <button
              onClick={prevImage}
              disabled={currentImageIndex === 0 || isPlaying}
              className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200 rounded-l border border-r-0 border-neutral-700 hover:border-neutral-600 disabled:border-neutral-800"
            >
              <SkipBack size={14} />
            </button>

            <button
              onClick={togglePlayback}
              className="flex items-center justify-center w-10 h-8 bg-neutral-700 hover:bg-neutral-600 transition-all duration-200 border border-neutral-600 hover:border-neutral-500"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <button
              onClick={nextImage}
              disabled={currentImageIndex === imageIds.length - 1 || isPlaying}
              className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200 rounded-r border border-l-0 border-neutral-700 hover:border-neutral-600 disabled:border-neutral-800"
            >
              <SkipForward size={14} />
            </button>
          </div>

          <div className="text-center flex-1 mx-3">
            <div className="text-sm font-semibold text-neutral-100">
              {currentImageIndex + 1} / {imageIds.length}
            </div>
            <div className="text-xs text-neutral-400">
              {imageIds.length > 0 ? Math.round(((currentImageIndex + 1) / imageIds.length) * 100) : 0}% {isPlaying && `• ${playSpeed}fps`}
            </div>
          </div>

          <div className="w-16"></div>
        </div>

        <div className="w-full mb-1.5">
          <input
            type="range"
            min="0"
            max={Math.max(0, imageIds.length - 1)}
            value={currentImageIndex}
            onChange={(e) => !isPlaying && goToImage(parseInt(e.target.value))}
            disabled={isPlaying}
            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #525252 0%, #525252 ${((currentImageIndex + 1) / imageIds.length) * 100}%, #404040 ${((currentImageIndex + 1) / imageIds.length) * 100}%, #404040 100%)`
            }}
          />
        </div>

        <div className="md:flex md:items-center md:justify-between">
          <div className="flex items-center gap-1 mb-1 md:mb-0">
            <span className="text-xs text-neutral-400">Speed:</span>
            {[0.5, 1, 2, 5, 10].map(speed => (
              <button
                key={speed}
                onClick={() => changePlaySpeed(speed)}
                className={`px-1.5 py-0.5 text-xs rounded transition-all duration-200 ${
                  playSpeed === speed
                    ? 'bg-neutral-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {speed}fps
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 justify-center md:justify-end">
            <button
              onClick={() => goToImage(0)}
              disabled={isPlaying}
              className="px-1.5 py-0.5 bg-neutral-800 text-neutral-200 rounded text-xs hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200"
            >
              First
            </button>
            <button
              onClick={() => goToImage(Math.floor(imageIds.length / 4))}
              disabled={isPlaying}
              className="px-1.5 py-0.5 bg-neutral-800 text-neutral-200 rounded text-xs hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200"
            >
              25%
            </button>
            <button
              onClick={() => goToImage(Math.floor(imageIds.length / 2))}
              disabled={isPlaying}
              className="px-1.5 py-0.5 bg-neutral-800 text-neutral-200 rounded text-xs hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200"
            >
              50%
            </button>
            <button
              onClick={() => goToImage(Math.floor((imageIds.length * 3) / 4))}
              disabled={isPlaying}
              className="px-1.5 py-0.5 bg-neutral-800 text-neutral-200 rounded text-xs hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200"
            >
              75%
            </button>
            <button
              onClick={() => goToImage(imageIds.length - 1)}
              disabled={isPlaying}
              className="px-1.5 py-0.5 bg-neutral-800 text-neutral-200 rounded text-xs hover:bg-neutral-700 disabled:bg-neutral-800/50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}