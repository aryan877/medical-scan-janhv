'use client';

import { useEffect, useState } from 'react';
import DicomViewer from '@/components/DicomViewer';
import SeriesSelector from '@/components/SeriesSelector';
import MobileSeriesDropdown from '@/components/MobileSeriesDropdown';

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
        const response = await fetch('/api/dicom-files');
        const data = await response.json();

        if (response.ok) {
          setSeries(data.series);
          // Auto-select the first series
          if (data.series.length > 0) {
            setSelectedSeriesId(data.series[0].id);
          }
        } else {
          setError(data.error || 'Failed to load DICOM files');
        }
      } catch {
        setError('Network error while loading DICOM files');
      } finally {
        setLoading(false);
      }
    };

    fetchDicomSeries();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg">Loading DICOM studies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-red-400">
          <p className="text-lg font-semibold">Error</p>
          <p>{error}</p>
          <p className="mt-2 text-sm">Make sure DCM files are placed in the public/dicom folder</p>
        </div>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-lg font-semibold">No DICOM files found</p>
          <p className="text-gray-400">Please add DCM files to the public/dicom folder</p>
        </div>
      </div>
    );
  }

  const selectedSeries = selectedSeriesId ? series.find(s => s.id === selectedSeriesId) : null;

  return (
    <div className="min-h-screen bg-black">
      {/* Clean header */}
      <header className="bg-gray-900 border-b border-gray-700">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-white text-lg md:text-xl font-medium">DICOM Viewer</h1>
            <div className="text-white text-xs md:text-sm">
              {series.length} series loaded
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col md:flex-row h-screen-minus-header">
        {/* Mobile Layout */}
        <div className="md:hidden flex flex-col h-full">
          {/* Mobile dropdown series selector */}
          <div className="bg-gray-900 p-3 border-b border-gray-700 flex-shrink-0">
            <MobileSeriesDropdown
              series={series}
              selectedSeriesId={selectedSeriesId}
              onSeriesSelect={setSelectedSeriesId}
            />
          </div>

          {/* DICOM viewer takes remaining space */}
          <div className="flex-1 min-h-0">
            {selectedSeries ? (
              <DicomViewer dicomFiles={selectedSeries.files} />
            ) : (
              <div className="h-full flex items-center justify-center text-white">
                <p className="text-base mobile-text">Select a series to view</p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex md:h-full md:w-full">
          <div className="w-80 flex-shrink-0">
            <SeriesSelector
              series={series}
              selectedSeriesId={selectedSeriesId}
              onSeriesSelect={setSelectedSeriesId}
            />
          </div>

          <div className="flex-1 min-h-0">
            {selectedSeries ? (
              <DicomViewer dicomFiles={selectedSeries.files} />
            ) : (
              <div className="h-full flex items-center justify-center text-white">
                <p className="text-base">Select a series to view</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
