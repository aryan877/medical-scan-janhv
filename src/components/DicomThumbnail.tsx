"use client";

import { useEffect, useRef } from "react";
// Dynamic imports to avoid SSR issues
let cornerstone: typeof import("cornerstone-core") | undefined;
let cornerstoneWADOImageLoader:
  | typeof import("cornerstone-wado-image-loader")
  | undefined;
let dicomParser: typeof import("dicom-parser") | undefined;

// Configure cornerstone once at module level
let isConfigured = false;

async function initializeCornerstone() {
  if (typeof window === "undefined") return false;

  if (!isConfigured && !cornerstone) {
    try {
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
        useWebWorkers: false, // Disable for thumbnails
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: true,
        },
      });
      isConfigured = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize cornerstone for thumbnails:", error);
      return false;
    }
  }
  return isConfigured;
}

interface DicomThumbnailProps {
  dicomFile: string;
  size?: number;
  className?: string;
}

export default function DicomThumbnail({
  dicomFile,
  size = 48,
  className = "",
}: DicomThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idleCallbackIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const runLoad = async () => {
      if (isCancelled || !canvasRef.current || !dicomFile) return;

      try {
        // Ensure cornerstone is configured
        const initialized = await initializeCornerstone();
        if (isCancelled || !initialized) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        // Set canvas size
        canvas.width = size;
        canvas.height = size;

        // Load the DICOM image
        const imageId = `wadouri:${dicomFile}`;
        const image = await cornerstone!.loadImage(imageId);

        if (isCancelled) return;

        // Create a temporary canvas for rendering
        if (typeof document === "undefined") return;
        const tempCanvas = document.createElement("canvas");
        const tempContext = tempCanvas.getContext("2d");
        if (!tempContext) return;

        // Calculate dimensions to fit the image in the thumbnail
        const imageAspectRatio = image.width / image.height;
        let drawWidth, drawHeight;

        if (imageAspectRatio > 1) {
          // Landscape
          drawWidth = size;
          drawHeight = size / imageAspectRatio;
        } else {
          // Portrait or square
          drawWidth = size * imageAspectRatio;
          drawHeight = size;
        }

        // Set temp canvas size to match the image
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;

        // Get the pixel data
        const pixelData = image.getPixelData();
        const imageData = tempContext.createImageData(
          image.width,
          image.height
        );

        // Convert DICOM pixel data to RGBA
        if (image.color) {
          // Color image
          for (let i = 0; i < pixelData.length; i += 3) {
            const pixelIndex = (i / 3) * 4;
            imageData.data[pixelIndex] = pixelData[i]; // R
            imageData.data[pixelIndex + 1] = pixelData[i + 1]; // G
            imageData.data[pixelIndex + 2] = pixelData[i + 2]; // B
            imageData.data[pixelIndex + 3] = 255; // A
          }
        } else {
          // Grayscale image - apply window/level
          const windowCenter = Number(image.windowCenter) || 128;
          const windowWidth = Number(image.windowWidth) || 256;
          const slope = Number(image.slope) || 1;
          const intercept = Number(image.intercept) || 0;

          for (let i = 0; i < pixelData.length; i++) {
            let pixelValue = Number(pixelData[i]) * slope + intercept;

            // Apply window/level
            const minValue = windowCenter - windowWidth / 2;
            const maxValue = windowCenter + windowWidth / 2;

            if (pixelValue <= minValue) {
              pixelValue = 0;
            } else if (pixelValue >= maxValue) {
              pixelValue = 255;
            } else {
              pixelValue =
                ((pixelValue - minValue) / Number(windowWidth)) * 255;
            }

            const pixelIndex = i * 4;
            imageData.data[pixelIndex] = pixelValue; // R
            imageData.data[pixelIndex + 1] = pixelValue; // G
            imageData.data[pixelIndex + 2] = pixelValue; // B
            imageData.data[pixelIndex + 3] = 255; // A
          }
        }

        // Put the image data on the temp canvas
        tempContext.putImageData(imageData, 0, 0);

        // Clear the thumbnail canvas
        context.fillStyle = "#000";
        context.fillRect(0, 0, size, size);

        // Draw the scaled image centered on the thumbnail canvas
        const offsetX = (size - drawWidth) / 2;
        const offsetY = (size - drawHeight) / 2;

        context.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
      } catch (err) {
        console.error("Failed to load DICOM thumbnail:", err);

        // Show fallback
        if (!isCancelled && canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d");
          if (context) {
            canvas.width = size;
            canvas.height = size;
            context.fillStyle = "#374151";
            context.fillRect(0, 0, size, size);
            context.fillStyle = "#9CA3AF";
            context.font = "12px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("IMG", size / 2, size / 2);
          }
        }
      }
    };

    const scheduleLoad = () => {
      if (typeof window === "undefined") {
        timeoutIdRef.current = setTimeout(runLoad, 0);
        return;
      }

      const idleCallback = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void) => number;
        }
      ).requestIdleCallback;
      if (idleCallback) {
        idleCallbackIdRef.current = idleCallback(() => {
          runLoad();
        });
      } else {
        timeoutIdRef.current = setTimeout(runLoad, 0);
      }
    };

    scheduleLoad();

    return () => {
      isCancelled = true;

      if (typeof window !== "undefined") {
        const cancelIdleCallback = (
          window as unknown as { cancelIdleCallback?: (handle: number) => void }
        ).cancelIdleCallback;
        if (cancelIdleCallback && idleCallbackIdRef.current !== null) {
          cancelIdleCallback(idleCallbackIdRef.current);
          idleCallbackIdRef.current = null;
        }
      }

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [dicomFile, size]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
