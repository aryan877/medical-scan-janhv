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

const MIN_VIEWER_HEIGHT = 220;

export default function DicomViewer({ dicomFiles, seriesName = 'DICOM_Series' }: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const [viewerAreaHeight, setViewerAreaHeight] = useState<number | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heightMeasureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const applyViewportToFit = useCallback(() => {
    const element = elementRef.current;
    if (!element || !cornerstone || !isInitialized) {
      return;
    }

    try {
      cornerstone.resize(element, true);
      const enabledElement = cornerstone.getEnabledElement(element);
      const canvas = enabledElement?.canvas;
      const image = enabledElement?.image;

      if (!canvas || !image) {
        return;
      }

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
      console.warn('Resize error:', error);
    }
  }, [isInitialized]);

  const scheduleViewportResize = useCallback(() => {
    if (!elementRef.current || !cornerstone || !isInitialized) {
      return;
    }

    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      applyViewportToFit();
      resizeFrameRef.current = null;
    });
  }, [applyViewportToFit, isInitialized]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentImageIndex;
  }, [currentImageIndex]);

  useEffect(() => {
    // Reset playback state when series changes
    setIsPlaying(false);
    setCurrentImageIndex(0);
  }, [dicomFiles]);

  useEffect(() => {
    let isCancelled = false;
    const viewerElement = elementRef.current;
    let hasEnabledElement = false;
    let resizeObserver: ResizeObserver | null = null;

    const enableElement = () => {
      if (!cornerstone || !viewerElement || hasEnabledElement) return;
      try {
        // Ensure element has proper dimensions before enabling
        const rect = viewerElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          // Use ResizeObserver to wait for proper dimensions
          resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                resizeObserver?.disconnect();
                enableElement();
                break;
              }
            }
          });
          resizeObserver.observe(viewerElement);
          return;
        }

        cornerstone.enable(viewerElement);
        hasEnabledElement = true;
        cornerstone.resize(viewerElement, true);

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
            useWebWorkers: false, // Disable to avoid 'fs' issues
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

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

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
    if (!isInitialized || typeof window === 'undefined') {
      return;
    }

    const orientationTimeouts: Array<ReturnType<typeof setTimeout>> = [];

    const flushResize = () => {
      scheduleViewportResize();
    };

    const debouncedResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        flushResize();
        resizeTimeoutRef.current = null;
      }, 150);
    };

    const handleOrientationChange = () => {
      orientationTimeouts.push(
        setTimeout(() => {
          flushResize();
        }, 200)
      );
      orientationTimeouts.push(
        setTimeout(() => {
          flushResize();
        }, 700)
      );
    };

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleMediaChange = () => {
      orientationTimeouts.push(
        setTimeout(() => {
          flushResize();
        }, 100)
      );
    };

    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    mediaQuery.addEventListener('change', handleMediaChange);

    flushResize();

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

      orientationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    };
  }, [isInitialized, scheduleViewportResize]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const containerElement = containerRef.current;
    if (!containerElement) {
      return;
    }

    const observerTargets: Element[] = [containerElement];
    if (controlsRef.current) {
      observerTargets.push(controlsRef.current);
    }

    const updateViewerHeight = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }

      const controlsRect = controlsRef.current?.getBoundingClientRect();
      const availableHeight = containerRect.height - (controlsRect?.height ?? 0);
      const nextHeight = Math.max(availableHeight, MIN_VIEWER_HEIGHT);

      setViewerAreaHeight(prev => {
        if (prev === null || Math.abs(prev - nextHeight) > 1) {
          return nextHeight;
        }
        return prev;
      });
    };

    updateViewerHeight();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          updateViewerHeight();
        })
      : null;

    if (resizeObserver) {
      observerTargets.forEach(target => resizeObserver.observe(target));
    }

    const scheduleHeightUpdate = (delay: number) => {
      if (heightMeasureTimeoutRef.current) {
        clearTimeout(heightMeasureTimeoutRef.current);
      }
      heightMeasureTimeoutRef.current = setTimeout(() => {
        updateViewerHeight();
        heightMeasureTimeoutRef.current = null;
      }, delay);
    };

    const handleResize = () => scheduleHeightUpdate(80);
    const handleOrientationChange = () => scheduleHeightUpdate(250);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (heightMeasureTimeoutRef.current) {
        clearTimeout(heightMeasureTimeoutRef.current);
        heightMeasureTimeoutRef.current = null;
      }
    };
  }, [containerRef, controlsRef]);

  useEffect(() => {
    if (viewerAreaHeight === null) {
      return;
    }

    scheduleViewportResize();
  }, [viewerAreaHeight, scheduleViewportResize]);

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
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyPress = (event: KeyboardEvent) => {
      if (isPlayingRef.current) {
        return;
      }

      const totalImages = imageCount;
      if (totalImages === 0) {
        return;
      }

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
          {
            const jumpSize = Math.max(1, Math.floor(totalImages / 50));
            goToImage(Math.min(totalImages - 1, currentIndexRef.current + jumpSize));
          }
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

  // Playback using requestAnimationFrame
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

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col min-h-0">
      {/* Image viewer area */}
      <div
        className="relative flex-1 bg-black mobile-viewer-height overflow-hidden"
        style={{
          height: viewerAreaHeight ?? undefined,
          minHeight: MIN_VIEWER_HEIGHT
        }}
      >
        <div
          ref={elementRef}
          className="absolute inset-0"
          role="img"
          aria-label={viewerLabel}
          style={{
            touchAction: 'pan-x pan-y pinch-zoom',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none'
          }}
        />
      </div>

      {/* Controls area */}
      <div
        ref={controlsRef}
        className="bg-neutral-900/95 backdrop-blur-sm text-neutral-100 border-t border-neutral-700/50 flex-shrink-0 mobile-controls-height"
      >
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

          {/* Bottom row: Speed and jump buttons */}
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
