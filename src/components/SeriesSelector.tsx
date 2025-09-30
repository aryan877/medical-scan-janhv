'use client';

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

interface SeriesSelectorProps {
  series: DicomSeries[];
  selectedSeriesId: string | null;
  onSeriesSelect: (seriesId: string) => void;
  showFooterHint?: boolean;
}

export default function SeriesSelector({
  series,
  selectedSeriesId,
  onSeriesSelect,
  showFooterHint = false
}: SeriesSelectorProps) {
  return (
    <div className="w-full h-full bg-transparent text-neutral-100 flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-200">SERIES</h2>
        <div className="text-xs text-neutral-400">{series.length} series</div>
      </div>

      <div className="flex-1 overflow-y-auto touch-pan-y px-3 py-4 space-y-2">
        {series.map((seriesItem, index) => {
          const isSelected = selectedSeriesId === seriesItem.id;

          return (
            <button
              key={seriesItem.id}
              type="button"
              onClick={() => onSeriesSelect(seriesItem.id)}
              className={`w-full text-left rounded-lg border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
                isSelected
                  ? 'border-neutral-600 bg-neutral-800/80 shadow-sm'
                  : 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/60 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border text-xs font-semibold flex-shrink-0 overflow-hidden ${
                    isSelected
                      ? 'border-neutral-600 text-neutral-300 bg-neutral-700/50'
                      : 'border-neutral-700 text-neutral-500 bg-neutral-800/50'
                  }`}
                >
                  {seriesItem.thumbnail ? (
                    <DicomThumbnail
                      dicomFile={seriesItem.thumbnail}
                      size={44}
                      className="border-0 rounded-md"
                    />
                  ) : (
                    index + 1
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-100">
                    {seriesItem.name}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400 line-clamp-2">
                    {seriesItem.description}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-neutral-400">{seriesItem.instanceCount} imgs</span>
                    {seriesItem.seriesNumber !== undefined && (
                      <span className="text-neutral-300 font-medium">#{seriesItem.seriesNumber}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showFooterHint && (
        <div className="px-4 py-3 border-t border-neutral-800 text-xs text-neutral-400 flex-shrink-0">
          <div className="font-semibold tracking-wide text-neutral-300 mb-1">STACK CONTROLS</div>
          <div>Use mouse wheel or arrow keys to navigate</div>
        </div>
      )}
    </div>
  );
}