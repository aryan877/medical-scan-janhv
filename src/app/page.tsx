"use client";

import DicomViewer from "@/components/DicomViewer";
import MobileSeriesDropdown from "@/components/MobileSeriesDropdown";
import SeriesSelector from "@/components/SeriesSelector";
import { useEffect, useState } from "react";

interface DicomSeries {
  id: string;
  name: string;
  description: string;
  files: string[];
  thumbnail?: string;
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  seriesNumber?: number;
  instanceCount: number;
}

export default function Home() {
  const [series, setSeries] = useState<DicomSeries[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDicomSeries = async () => {
      try {
        const response = await fetch("/api/dicom-files");
        const data = await response.json();

        if (response.ok) {
          setSeries(data.series);
          // Auto-select the first series
          if (data.series.length > 0) {
            setSelectedSeriesId(data.series[0].id);
          }
        } else {
          setError(data.error || "Failed to load DICOM files");
        }
      } catch {
        setError("Network error while loading DICOM files");
      } finally {
        setLoading(false);
      }
    };

    fetchDicomSeries();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center text-neutral-100">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-neutral-500 mx-auto mb-4"></div>
          <p className="text-lg font-medium">Loading DICOM studies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center text-red-400">
          <p className="text-lg font-semibold">Error</p>
          <p className="text-neutral-300">{error}</p>
          <p className="mt-2 text-sm text-neutral-500">
            Make sure DCM files are placed in the public/dicom folder
          </p>
        </div>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center text-neutral-100">
          <p className="text-lg font-semibold">No DICOM files found</p>
          <p className="text-neutral-400">
            Please add DCM files to the public/dicom folder
          </p>
        </div>
      </div>
    );
  }

  const selectedSeries = selectedSeriesId
    ? series.find((s) => s.id === selectedSeriesId)
    : null;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Modern header */}
      <header className="bg-neutral-900/50 backdrop-blur-sm border-b border-neutral-800">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-neutral-100 text-xl md:text-2xl font-semibold">
              DICOM Viewer by{" "}
              <a
                href="https://x.com/aryankumar877"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
              >
                Aryan
              </a>
            </h1>
            <div className="text-neutral-400 text-sm md:text-base">
              {series.length} series loaded
            </div>
          </div>
        </div>
      </header>

      <main
        className="flex flex-col md:flex-row"
        style={{ height: "calc(100vh - 72px)" }}
      >
        {/* Mobile Layout */}
        <div className="md:hidden flex flex-col h-full">
          {/* Mobile dropdown series selector */}
          <div className="bg-neutral-900/50 p-4 border-b border-neutral-800 flex-shrink-0">
            <MobileSeriesDropdown
              series={series}
              selectedSeriesId={selectedSeriesId}
              onSeriesSelect={setSelectedSeriesId}
            />
          </div>

          {/* DICOM viewer takes remaining space */}
          <div className="flex-1 min-h-0 p-4">
            {selectedSeries ? (
              <DicomViewer dicomFiles={selectedSeries.files} />
            ) : (
              <div className="h-full flex items-center justify-center bg-neutral-900/30 rounded-lg border border-neutral-800">
                <p className="text-neutral-400 text-base">
                  Select a series to view
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex md:h-full md:w-full">
          <div className="w-64 flex-shrink-0 p-3 pr-2">
            <div className="h-full bg-neutral-900/30 rounded-lg border border-neutral-800 overflow-hidden">
              <SeriesSelector
                series={series}
                selectedSeriesId={selectedSeriesId}
                onSeriesSelect={setSelectedSeriesId}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 p-3 pl-1">
            {selectedSeries ? (
              <DicomViewer dicomFiles={selectedSeries.files} />
            ) : (
              <div className="h-full flex items-center justify-center bg-neutral-900/30 rounded-lg border border-neutral-800">
                <p className="text-neutral-400 text-base">
                  Select a series to view
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
