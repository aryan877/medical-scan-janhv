'use client';

import { useState } from 'react';
import DicomThumbnail from './DicomThumbnail';

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

interface MobileSeriesDropdownProps {
  series: DicomSeries[];
  selectedSeriesId: string | null;
  onSeriesSelect: (seriesId: string) => void;
}

export default function MobileSeriesDropdown({
  series,
  selectedSeriesId,
  onSeriesSelect
}: MobileSeriesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-neutral-800/60 text-neutral-100 px-4 py-3 rounded-lg border border-neutral-700 hover:border-neutral-600 focus:outline-none focus:border-neutral-500 transition-all duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-700/50 rounded-md border border-neutral-600 flex items-center justify-center text-xs text-neutral-300 overflow-hidden">
            {selectedSeries?.thumbnail ? (
              <DicomThumbnail
                dicomFile={selectedSeries.thumbnail}
                size={28}
                className="border-0 rounded-sm"
              />
            ) : (
              'IMG'
            )}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium truncate">
              {selectedSeries ? selectedSeries.name : 'Select Series'}
            </div>
            <div className="text-xs text-neutral-400">
              {selectedSeries ? `${selectedSeries.instanceCount} images` : `${series.length} series available`}
            </div>
          </div>
        </div>
        <div className="text-neutral-400">
          {isOpen ? '▲' : '▼'}
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-neutral-800/95 backdrop-blur-sm border border-neutral-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {series.map((seriesItem) => {
            const isSelected = selectedSeriesId === seriesItem.id;

            return (
              <button
                key={seriesItem.id}
                onClick={() => {
                  onSeriesSelect(seriesItem.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-700/60 transition-all duration-200 ${
                  isSelected ? 'bg-neutral-700/80 border-l-4 border-neutral-500' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-md border flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden ${
                  isSelected
                    ? 'border-neutral-500 text-neutral-300 bg-neutral-600/50'
                    : 'border-neutral-600 text-neutral-400 bg-neutral-700/50'
                }`}>
                  {seriesItem.thumbnail ? (
                    <DicomThumbnail
                      dicomFile={seriesItem.thumbnail}
                      size={28}
                      className="border-0 rounded-sm"
                    />
                  ) : (
                    'IMG'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-100 truncate">
                    {seriesItem.name}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span>{seriesItem.instanceCount} images</span>
                    {seriesItem.seriesNumber !== undefined && (
                      <span className="text-neutral-300 font-medium">#{seriesItem.seriesNumber}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}