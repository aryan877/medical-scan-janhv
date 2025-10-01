"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

// Dynamic imports to avoid SSR issues
let cornerstone: typeof import("cornerstone-core") | undefined;
let cornerstoneWADOImageLoader:
  | typeof import("cornerstone-wado-image-loader")
  | undefined;
let dicomParser: typeof import("dicom-parser") | undefined;

interface DicomViewerProps {
  dicomFiles: string[];
  seriesName?: string;
}

const MIN_VIEWER_HEIGHT = 220;
const DESKTOP_SPEEDS = [0.5, 1, 2, 5, 10];
const MOBILE_SPEEDS = [0.5, 1, 2, 5, 10];

export default function DicomViewer({
  dicomFiles,
  seriesName = "DICOM_Series",
}: DicomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const [isMobile, setIsMobile] = useState(false);

  const playbackFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const imageIds = useMemo(
    () => dicomFiles.map((file) => `wadouri:${file}`),
    [dicomFiles]
  );
  const imageCount = imageIds.length;
  const isPlayingRef = useRef(isPlaying);
  const currentIndexRef = useRef(currentImageIndex);

  const normalizedSeriesName = useMemo(
    () => (seriesName ? seriesName.replace(/_/g, " ").trim() : ""),
    [seriesName]
  );

  const viewerLabel = normalizedSeriesName
    ? `${normalizedSeriesName} viewer`
    : "DICOM viewer";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);

    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

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
          windowWidth: image.windowWidth,
        },
        invert: false,
        pixelReplication: false,
        rotation: 0,
        hflip: false,
        vflip: false,
      };

      cornerstone.setViewport(element, viewport);
    } catch (error) {
      console.warn("Resize error:", error);
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
    if (!isInitialized || typeof window === "undefined") {
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
      orientationTimeouts.push(setTimeout(flushResize, 200));
      orientationTimeouts.push(setTimeout(flushResize, 700));
    };

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleMediaChange = () => {
      orientationTimeouts.push(setTimeout(flushResize, 100));
    };

    window.addEventListener("resize", debouncedResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    mediaQuery.addEventListener("change", handleMediaChange);

    flushResize();

    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      mediaQuery.removeEventListener("change", handleMediaChange);

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      orientationTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [isInitialized, scheduleViewportResize]);

  useEffect(() => {
    if (!isInitialized || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleViewportResize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    if (controlsRef.current) {
      observer.observe(controlsRef.current);
    }

    return () => observer.disconnect();
  }, [isInitialized, scheduleViewportResize]);

  useEffect(() => {
    if (isInitialized) {
      scheduleViewportResize();
    }
  }, [isInitialized, isMobile, scheduleViewportResize]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentImageIndex;
  }, [currentImageIndex]);

  useEffect(() => {
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
        const rect = viewerElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
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
        const message = (error as Error)?.message || "";
        if (message.includes("already been enabled")) {
          hasEnabledElement = true;
          if (!isCancelled) {
            setIsInitialized(true);
          }
        } else {
          console.error("Failed to enable Cornerstone element:", error);
        }
      }
    };

    const initializeCornerstone = async () => {
      try {
        if (typeof window === "undefined") return;

        if (!cornerstone) {
          const [
            cornerstoneModule,
            cornerstoneWADOImageLoaderModule,
            dicomParserModule,
          ] = await Promise.all([
            import("cornerstone-core"),
            import("cornerstone-wado-image-loader"),
            import("dicom-parser"),
          ]);

          cornerstone = cornerstoneModule.default || cornerstoneModule;
          cornerstoneWADOImageLoader =
            cornerstoneWADOImageLoaderModule.default ||
            cornerstoneWADOImageLoaderModule;
          dicomParser = dicomParserModule.default || dicomParserModule;

          cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
          cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

          cornerstoneWADOImageLoader.configure({
            useWebWorkers: false,
            decodeConfig: {
              convertFloatPixelDataToInt: false,
              use16BitDataType: true,
            },
          });
        }

        enableElement();
      } catch (error) {
        console.error("Failed to initialize Cornerstone:", error);
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
          console.warn("Failed to disable cornerstone element:", error);
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

  const loadImage = useCallback(
    async (index: number) => {
      const element = elementRef.current;
      if (!element || !cornerstone) return;

      const imageId = imageIds[index];
      if (!imageId) return;

      try {
        const image = await cornerstone.loadImage(imageId);
        cornerstone.displayImage(element, image);

        const enabledElement = cornerstone.getEnabledElement(element);
        const canvas = enabledElement.canvas;

        const scaleX = canvas.width / image.width;
        const scaleY = canvas.height / image.height;
        const scale = Math.min(scaleX, scaleY);

        const viewport = {
          scale,
          translation: { x: 0, y: 0 },
          voi: {
            windowCenter: image.windowCenter,
            windowWidth: image.windowWidth,
          },
          invert: false,
          pixelReplication: false,
          rotation: 0,
          hflip: false,
          vflip: false,
        };

        cornerstone.setViewport(element, viewport);
      } catch (error) {
        console.error("Failed to load DICOM image:", error);
      }
    },
    [imageIds]
  );

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
    if (!cornerstone || imageCount <= 1) return;

    const upcoming = [currentImageIndex + 1, currentImageIndex + 2]
      .map((index) => (index >= imageCount ? index % imageCount : index))
      .filter((index) => index !== currentImageIndex)
      .map((index) => imageIds[index]);

    upcoming.forEach((imageId) => {
      if (imageId) {
        cornerstone?.loadImage(imageId).catch(() => undefined);
      }
    });
  }, [currentImageIndex, imageCount, imageIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (isPlayingRef.current) {
        return;
      }

      const total = imageCount;
      if (total === 0) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          event.preventDefault();
          setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "ArrowRight":
        case "d":
        case "D":
          event.preventDefault();
          setCurrentImageIndex((prev) => Math.min(prev + 1, total - 1));
          break;
        case "Home":
          event.preventDefault();
          setCurrentImageIndex(0);
          break;
        case "End":
          event.preventDefault();
          setCurrentImageIndex(total - 1);
          break;
        case " ":
          event.preventDefault();
          {
            const jumpSize = Math.max(1, Math.floor(total / 50));
            setCurrentImageIndex((prev) =>
              Math.min(total - 1, prev + jumpSize)
            );
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [imageCount]);

  const nextImage = useCallback(() => {
    setCurrentImageIndex((prev) => {
      if (imageCount === 0) return 0;
      return Math.min(prev + 1, imageCount - 1);
    });
  }, [imageCount]);

  const prevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  const goToImage = useCallback(
    (index: number) => {
      if (imageCount === 0) return;

      const clampedIndex = Math.max(0, Math.min(index, imageCount - 1));
      if (clampedIndex !== currentImageIndex) {
        setCurrentImageIndex(clampedIndex);
      }
    },
    [imageCount, currentImageIndex]
  );

  const togglePlayback = () => {
    if (imageCount <= 1) return;
    setIsPlaying((prev) => !prev);
  };

  const changePlaySpeed = (speed: number) => {
    setPlaySpeed(speed);
  };

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
          setCurrentImageIndex((prev) => {
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

  const sliderPercentage =
    imageCount > 0
      ? Math.round(((currentImageIndex + 1) / imageCount) * 100)
      : 0;
  const speedOptions = isMobile ? MOBILE_SPEEDS : DESKTOP_SPEEDS;

  const renderJumpButtons = (className: string) => (
    <div className={className}>
      <button
        type="button"
        onClick={() => goToImage(0)}
        disabled={isPlaying || imageCount === 0}
        className="rounded border border-neutral-700/60 bg-neutral-800/60 px-2 py-1 text-[11px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-700/60 disabled:cursor-not-allowed disabled:border-neutral-700/30 disabled:bg-neutral-800/30 disabled:text-neutral-500"
      >
        First
      </button>
      <button
        type="button"
        onClick={() => goToImage(Math.floor(imageCount / 2))}
        disabled={isPlaying || imageCount === 0}
        className="rounded border border-neutral-700/60 bg-neutral-800/60 px-2 py-1 text-[11px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-700/60 disabled:cursor-not-allowed disabled:border-neutral-700/30 disabled:bg-neutral-800/30 disabled:text-neutral-500"
      >
        Mid
      </button>
      <button
        type="button"
        onClick={() => goToImage(imageCount - 1)}
        disabled={isPlaying || imageCount === 0}
        className="rounded border border-neutral-700/60 bg-neutral-800/60 px-2 py-1 text-[11px] font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-700/60 disabled:cursor-not-allowed disabled:border-neutral-700/30 disabled:bg-neutral-800/30 disabled:text-neutral-500"
      >
        Last
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full flex-col">
      <div
        className="relative flex-1 overflow-hidden rounded-lg bg-black"
        style={{ minHeight: MIN_VIEWER_HEIGHT }}
      >
        <div
          ref={elementRef}
          className="absolute inset-0"
          role="img"
          aria-label={viewerLabel}
          style={{
            touchAction: "pan-x pan-y pinch-zoom",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        />
      </div>

      <div
        ref={controlsRef}
        className="flex-shrink-0 border-t border-neutral-800 bg-neutral-900/90 backdrop-blur"
      >
        <div className="pb-safe">
          <div className="flex flex-col gap-2 px-3 py-2 md:gap-3 md:px-4 md:py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 md:flex-nowrap md:gap-3">
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  type="button"
                  onClick={prevImage}
                  disabled={
                    currentImageIndex === 0 || isPlaying || imageCount === 0
                  }
                  className="flex h-9 w-9 items-center justify-center rounded border border-neutral-700/50 bg-neutral-800/70 text-neutral-100 transition-colors duration-150 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-700/30 disabled:bg-neutral-800/30 disabled:text-neutral-500 md:h-10 md:w-10"
                  aria-label="Previous image"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  onClick={togglePlayback}
                  disabled={imageCount <= 1}
                  className={`flex h-9 w-10 items-center justify-center rounded border transition-colors duration-150 md:h-10 md:w-12 ${
                    imageCount <= 1
                      ? "cursor-not-allowed border-neutral-700/30 bg-neutral-800/30 text-neutral-500"
                      : "border-neutral-600/50 bg-neutral-700/80 text-neutral-100 hover:bg-neutral-600"
                  }`}
                  aria-label={isPlaying ? "Pause playback" : "Start playback"}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  disabled={
                    currentImageIndex === imageCount - 1 ||
                    isPlaying ||
                    imageCount === 0
                  }
                  className="flex h-9 w-9 items-center justify-center rounded border border-neutral-700/50 bg-neutral-800/70 text-neutral-100 transition-colors duration-150 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:border-neutral-700/30 disabled:bg-neutral-800/30 disabled:text-neutral-500 md:h-10 md:w-10"
                  aria-label="Next image"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              <div className="flex items-end gap-2 text-right text-xs text-neutral-400">
                <div className="text-sm font-medium text-neutral-100">
                  {imageCount === 0
                    ? "0/0"
                    : `${currentImageIndex + 1}/${imageCount}`}
                </div>
                <div>{sliderPercentage}%</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
              <input
                type="range"
                min="0"
                max={Math.max(0, imageCount - 1)}
                value={currentImageIndex}
                onChange={(event) => {
                  if (isPlaying) return;
                  const newIndex = parseInt(event.target.value, 10);
                  if (!Number.isNaN(newIndex)) {
                    goToImage(newIndex);
                  }
                }}
                disabled={isPlaying || imageCount === 0}
                aria-label="Image scrubber"
                className="slider w-full appearance-none bg-transparent"
                style={{
                  height: 16,
                  background:
                    imageCount > 0
                      ? `linear-gradient(to right, #6b7280 0%, #6b7280 ${sliderPercentage}%, #404040 ${sliderPercentage}%, #404040 100%)`
                      : undefined,
                }}
              />
              {renderJumpButtons("hidden gap-1 md:flex")}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
              <div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
                <span className="text-xs text-neutral-500">Speed:</span>
                {speedOptions.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => changePlaySpeed(speed)}
                    className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
                      playSpeed === speed
                        ? "bg-neutral-600 text-white"
                        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/70"
                    }`}
                    aria-pressed={playSpeed === speed}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              {renderJumpButtons("flex gap-1 md:hidden")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
