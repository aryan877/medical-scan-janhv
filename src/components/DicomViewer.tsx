'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from 'react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const playbackFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();
  const imageIds = useMemo(() => dicomFiles.map(file => `wadouri:${file}`), [dicomFiles]);
  const imageCount = imageIds.length;
  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentImageIndex);
  const normalizedSeriesName = useMemo(
    () => (seriesName ? seriesName.replace(/_/g, ' ').trim() : ''),
    [seriesName]
  );

  const viewerLabel = useMemo(() => {
    return normalizedSeriesName ? `${normalizedSeriesName} viewer` : 'DICOM viewer';
  }, [normalizedSeriesName]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentImageIndex;
  }, [currentImageIndex]);

  useEffect(() => {
    // Reset playback state when series changes to avoid unintentional autoplay
    setIsPlaying(false);
    setCurrentImageIndex(0);
  }, [dicomFiles]);

  useEffect(() => {
    let isCancelled = false;
    const viewerElement = elementRef.current;
    let hasEnabledElement = false;

    const enableElement = () => {
      if (!cornerstone || !viewerElement || hasEnabledElement) return;
      try {
        cornerstone.enable(viewerElement);
        hasEnabledElement = true;
        if (!isCancelled) {
          setIsInitialized(true);
        }
      } catch (error) {
        const message = (error as Error)?.message || '';
        if (message.includes('already been enabled')) {
          hasEnabledElement = true;
          if (!isCancelled) {
            setIsInitialized(true);
          }
        } else {
          console.error('Failed to enable Cornerstone element:', error);
        }
      }
    };

    const initializeCornerstone = async () => {
      try {
        if (typeof window === 'undefined') return;

        if (!cornerstone) {
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
        }

        enableElement();
      } catch (error) {
        console.error('Failed to initialize Cornerstone:', error);
      }
    };

    initializeCornerstone();

    return () => {
      isCancelled = true;

      if (hasEnabledElement && viewerElement && cornerstone) {
        try {
          cornerstone.disable(viewerElement);
        } catch (error) {
          console.warn('Failed to disable cornerstone element:', error);
        }
      }

      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, []);

  const loadImage = useCallback(async (index: number) => {
    const element = elementRef.current;
    if (!element || !cornerstone) return;

    const imageId = imageIds[index];
    if (!imageId) return;

    try {
      const image = await cornerstone.loadImage(imageId);
      cornerstone.displayImage(element, image);

      // Create viewport that fits the image to the element
      const enabledElement = cornerstone.getEnabledElement(element);
      const canvas = enabledElement.canvas;

      // Calculate scale to fit image in canvas
      const scaleX = canvas.width / image.width;
      const scaleY = canvas.height / image.height;
      const scale = Math.min(scaleX, scaleY);

      const viewport = {
        scale,
        translation: { x: 0, y: 0 },
        voi: {
          windowCenter: image.windowCenter,
          windowWidth: image.windowWidth
        },
        invert: false,
        pixelReplication: false,
        rotation: 0,
        hflip: false,
        vflip: false
      };

      cornerstone.setViewport(element, viewport);

    } catch (error) {
      console.error('Failed to load DICOM image:', error);
    }
  }, [imageIds]);

  useEffect(() => {
    if (isInitialized && imageCount > 0 && elementRef.current) {
      loadImage(currentImageIndex);
    }
  }, [isInitialized, imageCount, currentImageIndex, loadImage]);

  useEffect(() => {
    if (imageCount === 0) {
      setCurrentImageIndex(0);
    } else if (currentImageIndex >= imageCount) {
      setCurrentImageIndex(imageCount - 1);
    }
  }, [currentImageIndex, imageCount]);

  useEffect(() => {
    const handleResize = () => {
      if (elementRef.current && cornerstone && isInitialized) {
        if (resizeFrameRef.current !== null) {
          cancelAnimationFrame(resizeFrameRef.current);
        }

        resizeFrameRef.current = requestAnimationFrame(() => {
          try {
            const element = elementRef.current;
            if (cornerstone && element) {
              cornerstone.resize(element, true);
              // Re-apply viewport after resize
              const enabledElement = cornerstone.getEnabledElement(element);
              if (enabledElement && enabledElement.image) {
                const canvas = enabledElement.canvas;
                const image = enabledElement.image;

                // Calculate scale to fit image in canvas
                const scaleX = canvas.width / image.width;
                const scaleY = canvas.height / image.height;
                const scale = Math.min(scaleX, scaleY);

                const viewport = {
                  scale,
                  translation: { x: 0, y: 0 },
                  voi: {
                    windowCenter: image.windowCenter,
                    windowWidth: image.windowWidth
                  },
                  invert: false,
                  pixelReplication: false,
                  rotation: 0,
                  hflip: false,
                  vflip: false
                };

                cornerstone.setViewport(element, viewport);
              }
            }
          } catch (error) {
            console.warn('Resize error:', error);
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
    const debouncedResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(handleResize, 150);
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
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [isInitialized, loadImage]);

  // Playback using requestAnimationFrame to keep UI responsive on slower devices
  useEffect(() => {
    if (!isPlaying || imageCount <= 1) {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
      return;
    }

    let lastFrameTime = performance.now();
    const targetInterval = 1000 / playSpeed;

    const tick = (time: number) => {
      if (time - lastFrameTime >= targetInterval) {
        lastFrameTime = time;
        startTransition(() => {
          setCurrentImageIndex(prev => {
            const next = prev + 1;
            return next >= imageCount ? 0 : next;
          });
        });
      }

      playbackFrameRef.current = requestAnimationFrame(tick);
    };

    playbackFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
    };
  }, [imageCount, isPlaying, playSpeed, startTransition]);

  // Prefetch adjacent images to minimize playback stutter
  useEffect(() => {
    if (!cornerstone || imageCount <= 1) return;

    const upcoming = [currentImageIndex + 1, currentImageIndex + 2]
      .map(index => (index >= imageCount ? index % imageCount : index))
      .filter(index => index !== currentImageIndex)
      .map(index => imageIds[index]);

    upcoming.forEach(imageId => {
      if (imageId && cornerstone) {
        cornerstone.loadImage(imageId).catch(() => undefined);
      }
    });
  }, [currentImageIndex, imageCount, imageIds]);

  const nextImage = useCallback(() => {
    setCurrentImageIndex(prev => {
      if (imageCount === 0) return 0;
      return Math.min(prev + 1, imageCount - 1);
    });
  }, [imageCount]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : 0));
  }, []);

  const goToImage = useCallback((index: number) => {
    if (imageCount === 0) return;

    const clampedIndex = Math.max(0, Math.min(index, imageCount - 1));
    if (clampedIndex !== currentImageIndex) {
      setCurrentImageIndex(clampedIndex);
    }
  }, [imageCount, currentImageIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (isPlayingRef.current) return; // Disable keyboard controls during playback

      const totalImages = imageCount;
      if (totalImages === 0) return;

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
          goToImage(totalImages - 1);
          break;
        case ' ':
          event.preventDefault();
          const jumpSize = Math.max(1, Math.floor(totalImages / 50));
          goToImage(Math.min(totalImages - 1, currentIndexRef.current + jumpSize));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [goToImage, imageCount, nextImage, prevImage]);


  const togglePlayback = () => {
    if (imageCount <= 1) return;
    setIsPlaying(!isPlaying);
  };

  const changePlaySpeed = (speed: number) => {
    setPlaySpeed(speed);
  };


  return (
    <div className="w-full h-full flex flex-col">
      {/* Image viewer area */}
      <div className="flex-1 bg-black">
        <div
          ref={elementRef}
          className="w-full h-full"
          role="img"
          aria-label={viewerLabel}
        />
      </div>

      {/* Controls area */}
      <div className="bg-neutral-900/95 backdrop-blur-sm text-neutral-100 border-t border-neutral-700/50 flex-shrink-0">
        <div className="pb-safe">
        <div className="p-2 space-y-2">
          {/* Top row: Controls and counter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={prevImage}
                disabled={currentImageIndex === 0 || isPlaying || imageCount === 0}
                className="flex items-center justify-center w-8 h-8 bg-neutral-800/70 hover:bg-neutral-700 disabled:bg-neutral-800/30 disabled:cursor-not-allowed transition-all duration-200 rounded-l border border-r-0 border-neutral-700/50 touch-manipulation"
              >
                <SkipBack size={14} />
              </button>

              <button
                onClick={togglePlayback}
                disabled={imageCount <= 1}
                className={`flex items-center justify-center w-10 h-8 border transition-all duration-200 touch-manipulation ${
                  imageCount <= 1
                    ? 'bg-neutral-800/30 text-neutral-500 border-neutral-700/50 cursor-not-allowed'
                    : 'bg-neutral-700/70 hover:bg-neutral-600 border-neutral-600/50'
                }`}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              <button
                onClick={nextImage}
                disabled={currentImageIndex === imageCount - 1 || isPlaying || imageCount === 0}
                className="flex items-center justify-center w-8 h-8 bg-neutral-800/70 hover:bg-neutral-700 disabled:bg-neutral-800/30 disabled:cursor-not-allowed transition-all duration-200 rounded-r border border-l-0 border-neutral-700/50 touch-manipulation"
              >
                <SkipForward size={14} />
              </button>
            </div>

            <div className="text-center flex-shrink-0 ml-3">
              <div className="text-sm font-medium text-neutral-200">
                {imageCount === 0 ? '0/0' : `${currentImageIndex + 1}/${imageCount}`}
              </div>
              <div className="text-xs text-neutral-400">
                {imageCount > 0 ? Math.round(((currentImageIndex + 1) / imageCount) * 100) : 0}%
              </div>
            </div>
          </div>

          <div className="w-full mb-1">
            <input
              type="range"
              min="0"
              max={Math.max(0, imageCount - 1)}
              value={currentImageIndex}
              onChange={(e) => {
                if (!isPlaying) {
                  const newIndex = parseInt(e.target.value);
                  if (newIndex !== currentImageIndex) {
                    goToImage(newIndex);
                  }
                }
              }}
              disabled={isPlaying || imageCount === 0}
              className="w-full h-1 bg-neutral-800/50 rounded-lg appearance-none cursor-pointer slider-optimized"
              style={{
                background:
                  imageCount > 0
                    ? `linear-gradient(to right, #525252 0%, #525252 ${((currentImageIndex + 1) / imageCount) * 100}%, #404040 ${((currentImageIndex + 1) / imageCount) * 100}%, #404040 100%)`
                    : undefined
              }}
            />
          </div>

          {/* Bottom row: Speed and jump buttons - compact for mobile */}
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex items-center justify-between min-w-max gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-500 flex-shrink-0">Speed:</span>
                {[0.5, 1, 2, 5, 10].map(speed => (
                  <button
                    key={speed}
                    onClick={() => changePlaySpeed(speed)}
                    className={`px-2 py-1 text-xs rounded transition-all duration-200 touch-manipulation ${
                      playSpeed === speed
                        ? 'bg-neutral-600/80 text-white'
                        : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => goToImage(0)}
                  disabled={isPlaying || imageCount === 0}
                  className="px-2 py-1 bg-neutral-800/50 text-neutral-300 rounded text-xs hover:bg-neutral-700/50 disabled:bg-neutral-800/30 disabled:cursor-not-allowed transition-all duration-200 touch-manipulation"
                >
                  First
                </button>
                <button
                  onClick={() => goToImage(Math.floor(imageCount / 2))}
                  disabled={isPlaying || imageCount === 0}
                  className="px-2 py-1 bg-neutral-800/50 text-neutral-300 rounded text-xs hover:bg-neutral-700/50 disabled:bg-neutral-800/30 disabled:cursor-not-allowed transition-all duration-200 touch-manipulation"
                >
                  Mid
                </button>
                <button
                  onClick={() => goToImage(imageCount - 1)}
                  disabled={isPlaying || imageCount === 0}
                  className="px-2 py-1 bg-neutral-800/50 text-neutral-300 rounded text-xs hover:bg-neutral-700/50 disabled:bg-neutral-800/30 disabled:cursor-not-allowed transition-all duration-200 touch-manipulation"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
