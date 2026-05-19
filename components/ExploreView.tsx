'use client';

import HexSidebar from '@/components/HexSidebar';
import HistoricalMapControls from '@/components/HistoricalMapControls';
import type { HexCell } from '@/components/HoneycombMap';
import TimeSliderControl from '@/components/TimeSliderControl';
import type { HoneycombData, MapTimelineObject } from '@/types/collection';
import {
  ChevronDown,
  ChevronUp,
  Globe2,
  ImageIcon,
  Layers,
  MapPin,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

const HoneycombMap = dynamic(() => import('@/components/HoneycombMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-(--color-cream-dark) animate-pulse" />
  ),
});

const MAX_MAP_ZOOM = 18;

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

function parseNumber(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function parseBool(value: string | null, fallback = false) {
  if (value === null) return fallback;
  return value === '1' || value === 'true';
}

function normalizeYearRange(
  from: number,
  to: number,
  min: number,
  max: number,
): { from: number; to: number } {
  const clampedFrom = Math.min(max, Math.max(min, Math.round(from)));
  const clampedTo = Math.min(max, Math.max(min, Math.round(to)));
  return clampedFrom <= clampedTo
    ? { from: clampedFrom, to: clampedTo }
    : { from: clampedTo, to: clampedFrom };
}

export default function ExploreView({
  data,
  minYear,
  maxYear,
}: ExploreViewProps) {
  const t = useTranslations('explore');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { objects, binsByResolution } = data;

  const initialFrom = parseNumber(
    searchParams.get('from'),
    minYear,
    minYear,
    maxYear,
  );
  const initialTo = parseNumber(
    searchParams.get('to'),
    maxYear,
    minYear,
    maxYear,
  );
  const initialRange = normalizeYearRange(
    initialFrom,
    initialTo,
    minYear,
    maxYear,
  );
  const initialZoom = parseNumber(searchParams.get('z'), 7, 5, MAX_MAP_ZOOM);
  const initialLat = parseNumber(searchParams.get('lat'), 4.5, -90, 90);
  const initialLng = parseNumber(searchParams.get('lng'), -55.5, -180, 180);

  const [fromYear, setFromYear] = useState(initialRange.from);
  const [toYear, setToYear] = useState(initialRange.to);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedHexId, setSelectedHexId] = useState<string | null>(
    searchParams.get('hex') || null,
  );
  const [selectedPointId, setSelectedPointId] = useState<string | null>(
    searchParams.get('pt') || null,
  );
  const [zoom, setZoom] = useState(initialZoom);
  const [center, setCenter] = useState({ lat: initialLat, lng: initialLng });
  const [locationQuery, setLocationQuery] = useState(
    searchParams.get('q') || '',
  );
  const [imagesOnly, setImagesOnly] = useState(
    searchParams.has('img') ? parseBool(searchParams.get('img')) : true,
  );
  const [showPoints, setShowPoints] = useState(
    parseBool(searchParams.get('pts')),
  );
  const [showBroadAreas, setShowBroadAreas] = useState(
    parseBool(searchParams.get('broad')),
  );
  const [menuCollapsed, setMenuCollapsed] = useState(
    parseBool(searchParams.get('mc')),
  );
  const [searchCollapsed, setSearchCollapsed] = useState(
    parseBool(searchParams.get('sc'), true),
  );
  const [placesCollapsed, setPlacesCollapsed] = useState(
    parseBool(searchParams.get('pc'), true),
  );
  const [filtersCollapsed, setFiltersCollapsed] = useState(
    parseBool(searchParams.get('fc'), true),
  );
  const [historicalCollapsed, setHistoricalCollapsed] = useState(
    parseBool(searchParams.get('hc'), true),
  );
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    key: string;
  } | null>(null);
  const [activeHistoricalMap, setActiveHistoricalMap] = useState<
    'suriname' | 'paramaribo' | 'none'
  >((searchParams.get('hm') as 'suriname' | 'paramaribo' | 'none') || 'none');
  const [historicalMapOpacity, setHistoricalMapOpacity] = useState(
    parseNumber(searchParams.get('hmo'), 0.6, 0, 1),
  );

  // Build a per-cell view that respects the active year range.
  const {
    hexes,
    backgroundHexes,
    points,
    selectedPointObjects,
    selectedObjects,
    totalInView,
    locationCounts,
  } = useMemo(() => {
    const resolution = resolutionForZoom(zoom);
    const bins = binsByResolution[resolution] ?? [];
    const background = data.backgroundByResolution[resolution] ?? [];

    const cells: HexCell[] = [];
    let total = 0;
    let selected: MapTimelineObject[] = [];
    const selectedForPoint: MapTimelineObject[] = [];
    const locations = new Map<
      string,
      { id: string; count: number; lat: number; lng: number; label: string }
    >();

    for (const bin of bins) {
      let count = 0;
      const matched: MapTimelineObject[] = [];
      for (const idx of bin.indices) {
        const obj = objects[idx];
        if (obj.year >= fromYear && obj.year <= toYear) {
          if (!showBroadAreas && obj.isBroadArea) continue;
          if (imagesOnly && (!obj.isPublicDomain || !obj.thumbnailUrl)) {
            continue;
          }
          count += 1;
          const locationId = `${obj.locationLabel}::${obj.lat.toFixed(5)}::${obj.lng.toFixed(5)}`;
          const existing = locations.get(locationId);
          if (existing) {
            existing.count += 1;
          } else {
            locations.set(locationId, {
              id: locationId,
              count: 1,
              lat: obj.lat,
              lng: obj.lng,
              label: obj.locationLabel,
            });
          }
          if (selectedHexId === bin.id) matched.push(obj);
          if (selectedPointId && locationId === selectedPointId) {
            selectedForPoint.push(obj);
          }
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
      points: [...locations.values()]
        .map(({ id, label, count, lat, lng }) => ({
          id,
          label,
          count,
          lat,
          lng,
        }))
        .sort((a, b) => b.count - a.count),
      selectedPointObjects: selectedForPoint,
      selectedObjects: selected,
      totalInView: total,
      locationCounts: [...locations.values()]
        .map(({ label, count, lat, lng }) => ({ label, count, lat, lng }))
        .sort((a, b) => b.count - a.count),
    };
  }, [
    binsByResolution,
    data.backgroundByResolution,
    objects,
    zoom,
    fromYear,
    toYear,
    selectedHexId,
    selectedPointId,
    imagesOnly,
    showBroadAreas,
  ]);

  const handleRangeChange = (from: number, to: number) => {
    const normalized = normalizeYearRange(from, to, minYear, maxYear);
    setFromYear(normalized.from);
    setToYear(normalized.to);
  };

  const handleViewChange = useCallback((view: { lat: number; lng: number }) => {
    setCenter({ lat: view.lat, lng: view.lng });
  }, []);

  const activeSelectedHexId =
    selectedHexId && hexes.some((hex) => hex.id === selectedHexId)
      ? selectedHexId
      : null;
  const activeSelectedPointId =
    selectedPointId && points.some((point) => point.id === selectedPointId)
      ? selectedPointId
      : null;

  const activeSidebarObjects =
    activeSelectedHexId !== null
      ? selectedObjects
      : activeSelectedPointId !== null
        ? selectedPointObjects
        : [];

  useEffect(() => {
    const normalized = normalizeYearRange(fromYear, toYear, minYear, maxYear);
    if (normalized.from !== fromYear) setFromYear(normalized.from);
    if (normalized.to !== toYear) setToYear(normalized.to);
  }, [fromYear, toYear, minYear, maxYear]);

  useEffect(() => {
    const params = new URLSearchParams();

    params.set('from', String(fromYear));
    params.set('to', String(toYear));
    params.set('z', String(Math.round(zoom)));
    params.set('lat', center.lat.toFixed(4));
    params.set('lng', center.lng.toFixed(4));

    if (activeSelectedHexId) params.set('hex', activeSelectedHexId);
    if (activeSelectedPointId) params.set('pt', activeSelectedPointId);
    if (locationQuery.trim()) params.set('q', locationQuery.trim());
    if (imagesOnly) params.set('img', '1');
    if (showPoints) params.set('pts', '1');
    if (showBroadAreas) params.set('broad', '1');
    if (menuCollapsed) params.set('mc', '1');
    if (searchCollapsed) params.set('sc', '1');
    if (placesCollapsed) params.set('pc', '1');
    if (filtersCollapsed) params.set('fc', '1');
    if (historicalCollapsed) params.set('hc', '1');
    if (activeHistoricalMap !== 'none') params.set('hm', activeHistoricalMap);
    if (historicalMapOpacity !== 0.6)
      params.set('hmo', historicalMapOpacity.toFixed(2));

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [
    fromYear,
    toYear,
    zoom,
    center.lat,
    center.lng,
    activeSelectedHexId,
    activeSelectedPointId,
    locationQuery,
    imagesOnly,
    showPoints,
    showBroadAreas,
    menuCollapsed,
    searchCollapsed,
    placesCollapsed,
    filtersCollapsed,
    historicalCollapsed,
    activeHistoricalMap,
    historicalMapOpacity,
    searchParams,
    router,
    pathname,
  ]);

  const filteredLocations = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    if (!query) return locationCounts;
    return locationCounts.filter((item) =>
      item.label.toLowerCase().includes(query),
    );
  }, [locationCounts, locationQuery]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const obj of objects) {
      if (!showBroadAreas && obj.isBroadArea) continue;
      if (imagesOnly && (!obj.isPublicDomain || !obj.thumbnailUrl)) continue;
      years.add(obj.year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [objects, showBroadAreas, imagesOnly]);

  const nearestYearWithData = useMemo(() => {
    if (fromYear !== toYear) return null;
    if (totalInView > 0) return null;
    if (availableYears.length === 0) return null;

    let nearest = availableYears[0];
    let bestDistance = Math.abs(availableYears[0] - fromYear);
    for (let i = 1; i < availableYears.length; i++) {
      const year = availableYears[i];
      const distance = Math.abs(year - fromYear);
      if (distance < bestDistance) {
        nearest = year;
        bestDistance = distance;
      }
    }
    return nearest;
  }, [fromYear, toYear, totalInView, availableYears]);

  const broadAreaStats = useMemo(() => {
    let total = 0;
    let withImage = 0;
    for (const obj of objects) {
      if (obj.year < fromYear || obj.year > toYear) continue;
      if (!obj.isBroadArea) continue;
      total += 1;
      if (obj.isPublicDomain && obj.thumbnailUrl) withImage += 1;
    }
    return { total, withImage };
  }, [objects, fromYear, toYear]);

  const handleSelectHex = useCallback((hexId: string | null) => {
    setSelectedHexId(hexId);
    if (hexId !== null) setSelectedPointId(null);
  }, []);

  const handleSelectPoint = useCallback((pointId: string | null) => {
    setSelectedPointId(pointId);
    if (pointId !== null) setSelectedHexId(null);
  }, []);

  const sidebarIsOpen = Boolean(activeSelectedHexId || activeSelectedPointId);

  return (
    <div className="explore-shell relative w-full h-full flex overflow-hidden">
      <div className="relative flex-1 min-w-0 h-full">
        <HoneycombMap
          hexes={hexes}
          backgroundHexes={backgroundHexes}
          selectedHexId={activeSelectedHexId}
          onSelectHex={handleSelectHex}
          onZoomChange={setZoom}
          onViewChange={handleViewChange}
          initialView={{ lat: center.lat, lng: center.lng, zoom }}
          focusTarget={focusTarget}
          resizeSignal={sidebarIsOpen}
          points={showPoints ? points : null}
          selectedPointId={activeSelectedPointId}
          onSelectPoint={handleSelectPoint}
          activeHistoricalMap={activeHistoricalMap}
          historicalMapOpacity={historicalMapOpacity}
        />

        {/* Objects in view + location search */}
        <div className="absolute top-4 right-4 z-1000 w-[min(15rem,calc(100%-2rem))] max-h-[calc(100%-9rem)] overflow-hidden border border-(--color-border) bg-(--color-card)/95 shadow-md backdrop-blur-md">
          <div className="px-2.5 py-1.5 border-b border-(--color-border) flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-(--color-charcoal)">
              <Layers size={12} className="text-(--color-charcoal-light)" />
              <span>
                <strong className="font-semibold">
                  {totalInView.toLocaleString()}
                </strong>{' '}
                <span className="text-(--color-warm-gray)">
                  {t('objectsShown')}
                </span>
              </span>
            </span>
            <button
              type="button"
              aria-expanded={!menuCollapsed}
              aria-label={
                menuCollapsed ? t('expandMenuPanel') : t('collapseMenuPanel')
              }
              onClick={() => setMenuCollapsed((v) => !v)}
              className="inline-flex items-center justify-center h-6 w-6 border border-(--color-border) bg-white text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors"
            >
              {menuCollapsed ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronUp size={14} />
              )}
            </button>
          </div>

          {!menuCollapsed && (
            <div className="max-h-[calc(100%-2rem)] overflow-y-auto overflow-x-hidden">
              <div className="border-b border-(--color-border)">
                <button
                  type="button"
                  aria-expanded={!filtersCollapsed}
                  onClick={() => setFiltersCollapsed((v) => !v)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers
                      size={12}
                      className="text-(--color-charcoal-light)"
                    />
                    Filters
                  </span>
                  {filtersCollapsed ? (
                    <ChevronDown
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  ) : (
                    <ChevronUp
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  )}
                </button>

                {!filtersCollapsed && (
                  <div className="border-t border-(--color-border)">
                    <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-(--color-charcoal)">
                        <ImageIcon
                          size={12}
                          className="text-(--color-charcoal-light)"
                        />
                        {t('imagesOnly')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={imagesOnly}
                        aria-label={t('imagesOnly')}
                        onClick={() => setImagesOnly((v) => !v)}
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                          imagesOnly
                            ? 'bg-(--color-charcoal)'
                            : 'bg-(--color-warm-gray-light)/60'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            imagesOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="px-2.5 py-1.5 border-t border-(--color-border) flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex items-center gap-1.5 text-(--color-charcoal)">
                        <Globe2
                          size={12}
                          className="text-(--color-charcoal-light)"
                        />
                        {t('showBroadAreas')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showBroadAreas}
                        aria-label={t('showBroadAreas')}
                        onClick={() => setShowBroadAreas((v) => !v)}
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                          showBroadAreas
                            ? 'bg-(--color-charcoal)'
                            : 'bg-(--color-warm-gray-light)/60'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            showBroadAreas
                              ? 'translate-x-3.5'
                              : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {showBroadAreas && (
                      <div className="px-2.5 pb-1.5 text-[11px] text-(--color-warm-gray)">
                        {broadAreaStats.total === 0 ? (
                          <span>No broad-area records in this year range.</span>
                        ) : imagesOnly && broadAreaStats.withImage === 0 ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="wrap-break-word">
                              Broad-area records exist, but none has a public
                              image for this range.
                            </span>
                            <button
                              type="button"
                              onClick={() => setImagesOnly(false)}
                              className="shrink-0 border border-(--color-border) bg-white px-2 py-0.5 text-[10px] font-medium text-(--color-charcoal) hover:bg-(--color-cream-dark)"
                            >
                              Show all
                            </button>
                          </div>
                        ) : (
                          <span>
                            Broad-area matches: {broadAreaStats.total}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="px-2.5 py-1.5 border-t border-(--color-border) flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-(--color-charcoal)">
                        <MapPin
                          size={12}
                          className="text-(--color-charcoal-light)"
                        />
                        {t('showPoints')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showPoints}
                        aria-label={t('showPoints')}
                        onClick={() => setShowPoints((v) => !v)}
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                          showPoints
                            ? 'bg-(--color-charcoal)'
                            : 'bg-(--color-warm-gray-light)/60'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            showPoints ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-b border-(--color-border)">
                <button
                  type="button"
                  aria-expanded={!historicalCollapsed}
                  onClick={() => setHistoricalCollapsed((v) => !v)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors"
                >
                  <span>Historical map</span>
                  {historicalCollapsed ? (
                    <ChevronDown
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  ) : (
                    <ChevronUp
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  )}
                </button>
                {!historicalCollapsed && (
                  <div className="border-t border-(--color-border) px-2.5 py-2">
                    <HistoricalMapControls
                      activeMap={activeHistoricalMap}
                      onActiveMapChange={setActiveHistoricalMap}
                      opacity={historicalMapOpacity}
                      onOpacityChange={setHistoricalMapOpacity}
                    />
                  </div>
                )}
              </div>

              <div className="border-b border-(--color-border)">
                <button
                  type="button"
                  aria-expanded={!searchCollapsed}
                  onClick={() => setSearchCollapsed((v) => !v)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Search
                      size={12}
                      className="text-(--color-charcoal-light)"
                    />
                    {t('searchLocations')}
                  </span>
                  {searchCollapsed ? (
                    <ChevronDown
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  ) : (
                    <ChevronUp
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  )}
                </button>
                {!searchCollapsed && (
                  <div className="px-2 pb-2">
                    <label htmlFor="location-search" className="sr-only">
                      {t('searchLocations')}
                    </label>
                    <div className="relative">
                      <Search
                        size={12}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-(--color-warm-gray-light)"
                      />
                      <input
                        id="location-search"
                        type="text"
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                        placeholder={t('searchLocations')}
                        className="w-full pl-7 pr-2 py-1 text-xs border border-(--color-border) bg-white text-(--color-charcoal) placeholder:text-(--color-warm-gray-light) focus:outline-none focus:border-(--color-charcoal-light)"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  aria-expanded={!placesCollapsed}
                  onClick={() => setPlacesCollapsed((v) => !v)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs text-(--color-charcoal) border-b border-(--color-border) hover:bg-(--color-cream-dark) transition-colors"
                >
                  <span>{t('placesInView')}</span>
                  {placesCollapsed ? (
                    <ChevronDown
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  ) : (
                    <ChevronUp
                      size={14}
                      className="text-(--color-charcoal-light)"
                    />
                  )}
                </button>

                {!placesCollapsed && (
                  <div className="max-h-44 overflow-y-auto p-1">
                    {filteredLocations.length === 0 ? (
                      <p className="px-2 py-1 text-[11px] text-(--color-warm-gray)">
                        {t('noMatchingPlaces')}
                      </p>
                    ) : (
                      filteredLocations.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() =>
                            setFocusTarget({
                              lat: item.lat,
                              lng: item.lng,
                              zoom: 11,
                              key: `${item.label}-${Date.now()}`,
                            })
                          }
                          className="w-full text-left px-2 py-1 text-[11px] flex items-center justify-between hover:bg-(--color-cream-dark) transition-colors"
                        >
                          <span className="truncate text-(--color-charcoal)">
                            {item.label}
                          </span>
                          <span className="ml-3 shrink-0 tabular-nums text-(--color-warm-gray)">
                            {item.count}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Time slider */}
        <div className="absolute bottom-3 left-1/2 z-1000 w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2">
          {nearestYearWithData !== null && (
            <div className="mb-2 border border-(--color-border) bg-(--color-card)/95 px-3 py-2 text-xs text-(--color-charcoal) shadow-md backdrop-blur-sm">
              <span>
                No objects found for {fromYear}. Nearest year with matches is{' '}
                <strong>{nearestYearWithData}</strong>.
              </span>
              <button
                type="button"
                onClick={() =>
                  handleRangeChange(nearestYearWithData, nearestYearWithData)
                }
                className="ml-2 border border-(--color-border) bg-white px-2 py-1 font-medium text-(--color-charcoal) hover:bg-(--color-cream-dark)"
              >
                Jump to {nearestYearWithData}
              </button>
            </div>
          )}
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
      </div>

      {/* Sidebar — pushes the map instead of overlaying */}
      <HexSidebar
        open={sidebarIsOpen}
        objects={activeSidebarObjects}
        onClose={() => {
          setSelectedHexId(null);
          setSelectedPointId(null);
        }}
      />
    </div>
  );
}
