'use client';

import HexSidebar from '@/components/HexSidebar';
import type { HexCell } from '@/components/HoneycombMap';
import TimeSliderControl from '@/components/TimeSliderControl';
import type { MapTimelineObject } from '@/types/collection';
import { cellToBoundary, latLngToCell } from 'h3-js';
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
  objects: MapTimelineObject[];
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
  objects,
  minYear,
  maxYear,
}: ExploreViewProps) {
  const t = useTranslations('explore');

  const [fromYear, setFromYear] = useState(minYear);
  const [toYear, setToYear] = useState(maxYear);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedHexId, setSelectedHexId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(7);

  const filteredObjects = useMemo(
    () => objects.filter((o) => o.year >= fromYear && o.year <= toYear),
    [objects, fromYear, toYear],
  );

  const hexes: HexCell[] = useMemo(() => {
    const resolution = resolutionForZoom(zoom);
    const bins = new Map<string, MapTimelineObject[]>();
    for (const obj of filteredObjects) {
      const id = latLngToCell(obj.lat, obj.lng, resolution);
      if (!bins.has(id)) bins.set(id, []);
      bins.get(id)!.push(obj);
    }
    return Array.from(bins.entries()).map(([id, objs]) => ({
      id,
      boundary: cellToBoundary(id) as [number, number][],
      count: objs.length,
      objects: objs,
    }));
  }, [filteredObjects, zoom]);

  const selectedHex = selectedHexId
    ? hexes.find((h) => h.id === selectedHexId)
    : null;

  const handleRangeChange = (from: number, to: number) => {
    setFromYear(from);
    setToYear(to);
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      <HoneycombMap
        hexes={hexes}
        selectedHexId={selectedHexId}
        onSelectHex={setSelectedHexId}
        onZoomChange={setZoom}
      />

      {/* Object count badge */}
      <div className="absolute top-4 left-4 z-1000 bg-(--color-card)/95 backdrop-blur-md border border-(--color-border) px-3 py-2 shadow-md flex items-center gap-2 text-sm">
        <Layers size={14} className="text-(--color-charcoal-light)" />
        <span className="text-(--color-charcoal)">
          <strong className="font-semibold">
            {filteredObjects.length.toLocaleString()}
          </strong>{' '}
          <span className="text-(--color-warm-gray)">{t('objectsShown')}</span>
        </span>
      </div>

      {/* Hint */}
      {!selectedHexId && (
        <div className="absolute top-4 right-4 z-1000 bg-(--color-charcoal)/85 text-white text-xs px-3 py-2 shadow-md max-w-xs hidden md:block">
          {t('clickHexHint')}
        </div>
      )}

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
        open={Boolean(selectedHex)}
        objects={selectedHex?.objects ?? []}
        onClose={() => setSelectedHexId(null)}
      />
    </div>
  );
}
