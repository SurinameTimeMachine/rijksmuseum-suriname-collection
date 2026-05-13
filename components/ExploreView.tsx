'use client';

import HexSidebar from '@/components/HexSidebar';
import type { HexCell } from '@/components/HoneycombMap';
import TimeSliderControl from '@/components/TimeSliderControl';
import type { HoneycombData, MapTimelineObject } from '@/types/collection';
import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

const HoneycombMap = dynamic(() => import('@/components/HoneycombMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-(--color-cream-dark) animate-pulse" />
  ),
});

interface ExploreViewProps {
  data: HoneycombData;
  minYear: number;
  maxYear: number;
}

function resolutionForZoom(zoom: number): number {
  if (zoom <= 6) return 4;
  if (zoom <= 8) return 5;
  if (zoom <= 10) return 6;
  if (zoom <= 12) return 7;
  return 8;
}

export default function ExploreView({
  data,
  minYear,
  maxYear,
}: ExploreViewProps) {
  const t = useTranslations('explore');
  const { objects, binsByResolution } = data;

  const [fromYear, setFromYear] = useState(minYear);
  const [toYear, setToYear] = useState(maxYear);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedHexId, setSelectedHexId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(7);

  // Build a per-cell view that respects the active year range.
  const { hexes, backgroundHexes, selectedObjects, totalInView } =
    useMemo(() => {
      const resolution = resolutionForZoom(zoom);
      const bins = binsByResolution[resolution] ?? [];
      const background = data.backgroundByResolution[resolution] ?? [];

      const cells: HexCell[] = [];
      let total = 0;
      let selected: MapTimelineObject[] = [];

      for (const bin of bins) {
        let count = 0;
        const matched: MapTimelineObject[] = [];
        for (const idx of bin.indices) {
          const obj = objects[idx];
          if (obj.year >= fromYear && obj.year <= toYear) {
            count += 1;
            if (selectedHexId === bin.id) matched.push(obj);
          }
        }
        if (count === 0) continue;
        total += count;
        cells.push({ id: bin.id, boundary: bin.boundary, count });
        if (selectedHexId === bin.id) selected = matched;
      }

      return {
        hexes: cells,
        backgroundHexes: background,
        selectedObjects: selected,
        totalInView: total,
      };
    }, [
      binsByResolution,
      data.backgroundByResolution,
      objects,
      zoom,
      fromYear,
      toYear,
      selectedHexId,
    ]);

  const handleRangeChange = (from: number, to: number) => {
    setFromYear(from);
    setToYear(to);
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <HoneycombMap
        hexes={hexes}
        backgroundHexes={backgroundHexes}
        selectedHexId={selectedHexId}
        onSelectHex={setSelectedHexId}
        onZoomChange={setZoom}
      />

      {/* Object count badge — top-right, clear of Leaflet's default topleft zoom buttons */}
      <div className="absolute top-4 right-4 z-1000 bg-(--color-card)/95 backdrop-blur-md border border-(--color-border) px-3 py-2 shadow-md flex items-center gap-2 text-sm">
        <Layers size={14} className="text-(--color-charcoal-light)" />
        <span className="text-(--color-charcoal)">
          <strong className="font-semibold">
            {totalInView.toLocaleString()}
          </strong>{' '}
          <span className="text-(--color-warm-gray)">{t('objectsShown')}</span>
        </span>
      </div>

      {/* Time slider */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-1000 w-[min(640px,calc(100%-2rem))]">
        <TimeSliderControl
          minYear={minYear}
          maxYear={maxYear}
          fromYear={fromYear}
          toYear={toYear}
          onChange={handleRangeChange}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
        />
      </div>

      {/* Sidebar */}
      <HexSidebar
        open={Boolean(selectedHexId)}
        objects={selectedObjects}
        onClose={() => setSelectedHexId(null)}
      />
    </div>
  );
}
