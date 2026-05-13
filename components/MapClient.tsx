'use client';

import 'leaflet/dist/leaflet.css';
import type { CollectionObject, GeoLocation } from '@/types/collection';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  Layers,
  Map as MapIcon,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import ObjectImage from './ObjectImage';

/* ---- SSR-safe mount check ---- */
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/* ---- Types ---- */
interface LocationGroup {
  id: string;
  keywords: string[];
  geo: GeoLocation;
  objects: CollectionObject[];
}

type LeafletModule = typeof import('leaflet');

interface MapClientProps {
  locations: LocationGroup[];
}

/* ---- Helpers ---- */
function countByRegion(locations: LocationGroup[], region: string) {
  return locations
    .filter((l) => l.geo.region === region)
    .reduce((sum, l) => sum + l.objects.length, 0);
}

function getAllObjectTypes(
  locations: LocationGroup[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const loc of locations) {
    for (const obj of loc.objects) {
      for (const t of obj.objectTypes) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/* ==================================================================
   MAIN COMPONENT
   ================================================================== */
export default function MapClient({ locations }: MapClientProps) {
  const t = useTranslations('map');
  const locale = useLocale();
  const mounted = useIsMounted();

  /* ---- View mode ---- */
  const [viewMode, setViewMode] = useState<'markers' | 'heatmap'>('markers');

  /* ---- Region filter ---- */
  const [regionFilter, setRegionFilter] = useState<
    'suriname' | 'netherlands' | 'both'
  >('suriname');

  /* ---- Object type filter ---- */
  const allObjectTypes = useMemo(
    () => getAllObjectTypes(locations),
    [locations],
  );
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showTypeFilter, setShowTypeFilter] = useState(false);

  /* ---- Location search ---- */
  const [searchQuery, setSearchQuery] = useState('');

  /* ---- Selected location ---- */
  const [selectedLocation, setSelectedLocation] =
    useState<LocationGroup | null>(null);

  /* ---- Filter logic ---- */
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      // Region filter
      if (regionFilter !== 'both' && loc.geo.region !== regionFilter)
        return false;

      // Object type filter: at least one object must match
      if (selectedTypes.size > 0) {
        const hasMatch = loc.objects.some((obj) =>
          obj.objectTypes.some((ot) => selectedTypes.has(ot)),
        );
        if (!hasMatch) return false;
      }

      return true;
    });
  }, [locations, regionFilter, selectedTypes]);

  /* ---- Filtered objects within a location (considering type filter) ---- */
  const getFilteredObjects = useCallback(
    (loc: LocationGroup) => {
      if (selectedTypes.size === 0) return loc.objects;
      return loc.objects.filter((obj) =>
        obj.objectTypes.some((ot) => selectedTypes.has(ot)),
      );
    },
    [selectedTypes],
  );

  /* ---- Sidebar search ---- */
  const searchedLocations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const locs = q
      ? filteredLocations.filter((l) => l.geo.name.toLowerCase().includes(q))
      : filteredLocations;
    return [...locs].sort(
      (a, b) => getFilteredObjects(b).length - getFilteredObjects(a).length,
    );
  }, [filteredLocations, searchQuery, getFilteredObjects]);

  /* ---- Stats ---- */
  const totalFilteredObjects = filteredLocations.reduce(
    (sum, l) => sum + getFilteredObjects(l).length,
    0,
  );

  /* ---- Toggle object type ---- */
  const toggleType = (typeName: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeName)) next.delete(typeName);
      else next.add(typeName);
      return next;
    });
    setSelectedLocation(null);
  };

  const clearTypeFilter = () => {
    setSelectedTypes(new Set());
    setSelectedLocation(null);
  };

  if (!mounted) {
    return (
      <div className="w-full h-150 bg-(--color-cream-dark) flex items-center justify-center">
        <Globe
          size={32}
          className="text-(--color-warm-gray-light) animate-pulse"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Summary stats ---- */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-(--color-warm-gray)">
        <span className="flex items-center gap-1.5">
          <MapPin size={14} className="text-(--color-charcoal-light)" />
          <strong className="text-(--color-charcoal)">
            {filteredLocations.length}
          </strong>{' '}
          {t('locations')}
        </span>
        <span className="flex items-center gap-1.5">
          <Layers size={14} className="text-(--color-charcoal-light)" />
          <strong className="text-(--color-charcoal)">
            {totalFilteredObjects.toLocaleString()}
          </strong>{' '}
          {t('objects')}
        </span>
        {selectedTypes.size > 0 && (
          <button
            onClick={clearTypeFilter}
            className="flex items-center gap-1 text-xs text-(--color-rijks-red) hover:underline"
          >
            <X size={12} />
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* ---- Region toggle and View Mode toggle ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 border border-(--color-border) p-1 bg-(--color-card)">
          <button
            onClick={() => setViewMode('markers')}
            className={`p-2 transition-colors ${
              viewMode === 'markers'
                ? 'bg-(--color-charcoal) text-white'
                : 'text-(--color-charcoal-light) hover:bg-(--color-cream-dark)'
            }`}
            title={t('markers')}
          >
            <MapIcon size={16} />
          </button>
          <button
            onClick={() => setViewMode('heatmap')}
            className={`p-2 transition-colors ${
              viewMode === 'heatmap'
                ? 'bg-(--color-charcoal) text-white'
                : 'text-(--color-charcoal-light) hover:bg-(--color-cream-dark)'
            }`}
            title={t('heatmap')}
          >
            <Flame size={16} />
          </button>
        </div>

        <div className="w-px h-8 bg-(--color-border) mx-1 hidden sm:block" />

        {(['suriname', 'netherlands', 'both'] as const).map((region) => {
          const isActive = regionFilter === region;
          const label =
            region === 'both'
              ? t('showBoth')
              : region === 'suriname'
                ? t('suriname')
                : t('netherlands');
          const count =
            region === 'both'
              ? locations.reduce((s, l) => s + l.objects.length, 0)
              : countByRegion(locations, region);

          return (
            <button
              key={region}
              onClick={() => {
                setRegionFilter(region);
                setSelectedLocation(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border transition-colors ${
                isActive
                  ? 'bg-(--color-charcoal) text-white border-(--color-charcoal)'
                  : 'bg-(--color-card) text-(--color-charcoal-light) border-(--color-border) hover:border-(--color-warm-gray-light)'
              }`}
            >
              {label}
              <span
                className={`text-xs ${isActive ? 'text-white/70' : 'text-(--color-warm-gray-light)'}`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Object type filter toggle */}
        <button
          onClick={() => setShowTypeFilter(!showTypeFilter)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border transition-colors ml-auto ${
            selectedTypes.size > 0
              ? 'bg-(--color-rijks-red)/10 text-(--color-rijks-red) border-(--color-rijks-red)/30'
              : 'bg-(--color-card) text-(--color-charcoal-light) border-(--color-border) hover:border-(--color-warm-gray-light)'
          }`}
        >
          <Filter size={14} />
          {t('objectType')}
          {selectedTypes.size > 0 && (
            <span className="w-5 h-5 bg-(--color-rijks-red) text-white text-xs flex items-center justify-center">
              {selectedTypes.size}
            </span>
          )}
          {showTypeFilter ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ---- Object type filter chips ---- */}
      {showTypeFilter && (
        <div className="flex flex-wrap gap-2 p-4 bg-(--color-card) border border-(--color-border)">
          {allObjectTypes.slice(0, 20).map((type) => {
            const isActive = selectedTypes.has(type.name);
            return (
              <button
                key={type.name}
                onClick={() => toggleType(type.name)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
                  isActive
                    ? 'bg-(--color-charcoal) text-white border-(--color-charcoal)'
                    : 'bg-white text-(--color-charcoal-light) border-(--color-border) hover:border-(--color-warm-gray-light)'
                }`}
              >
                {type.name}
                <span
                  className={`${isActive ? 'text-white/60' : 'text-(--color-warm-gray-light)'}`}
                >
                  {type.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Main layout: sidebar + map ---- */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar: location list */}
        <div className="lg:w-72 shrink-0 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-warm-gray-light)"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchLocations')}
              className="w-full pl-8 pr-3 py-2 bg-(--color-card) border border-(--color-border) text-sm text-(--color-charcoal) placeholder:text-(--color-warm-gray-light) focus:outline-none focus:ring-2 focus:ring-(--color-charcoal-light)/20 focus:border-(--color-charcoal-light)"
            />
          </div>

          {/* Location list */}
          <div className="h-135 overflow-y-auto border border-(--color-border) bg-(--color-card)">
            {searchedLocations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-(--color-warm-gray)">
                {t('noLocations')}
              </div>
            ) : (
              searchedLocations.map((loc) => {
                const objCount = getFilteredObjects(loc).length;
                const isSelected = selectedLocation?.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    onClick={() => setSelectedLocation(isSelected ? null : loc)}
                    className={`w-full text-left px-3 py-2.5 border-b border-(--color-border) last:border-b-0 transition-colors ${
                      isSelected
                        ? 'bg-(--color-charcoal) text-white'
                        : 'hover:bg-(--color-cream-dark)'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-(--color-charcoal)'}`}
                      >
                        {loc.geo.name}
                      </span>
                      <span
                        className={`text-xs shrink-0 ml-2 ${isSelected ? 'text-white/70' : 'text-(--color-warm-gray-light)'}`}
                      >
                        {objCount}
                      </span>
                    </div>
                    <span
                      className={`text-xs ${isSelected ? 'text-white/50' : 'text-(--color-warm-gray-light)'}`}
                    >
                      {loc.geo.region === 'suriname'
                        ? t('suriname')
                        : t('netherlands')}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Map + detail panel */}
        <div className="flex-1 min-w-0 space-y-4">
          <MapInner
            locations={filteredLocations}
            selectedLocation={selectedLocation}
            getFilteredObjects={getFilteredObjects}
            onSelectLocation={setSelectedLocation}
            regionFilter={regionFilter}
            viewMode={viewMode}
            locale={locale}
            t={t}
          />

          {/* Selected location detail panel */}
          {selectedLocation && (
            <SelectedLocationPanel
              location={selectedLocation}
              objects={getFilteredObjects(selectedLocation)}
              locale={locale}
              t={t}
              onClose={() => setSelectedLocation(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   SELECTED LOCATION PANEL
   ================================================================== */
function SelectedLocationPanel({
  location,
  objects,
  locale,
  t,
  onClose,
}: {
  location: LocationGroup;
  objects: CollectionObject[];
  locale: string;
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayObjects = showAll ? objects : objects.slice(0, 12);

  return (
    <div className="border border-(--color-border) bg-(--color-card) corner-fold">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border)">
        <div>
          <h3 className="font-serif text-lg font-bold text-(--color-charcoal)">
            {location.geo.name}
          </h3>
          <p className="text-sm text-(--color-warm-gray)">
            {t('objectsAtLocation', {
              count: objects.length,
              location: location.geo.name,
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/gallery?${location.keywords.map((k) => `location=${encodeURIComponent(k)}`).join('&')}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-(--color-charcoal) text-white hover:bg-(--color-charcoal-light) transition-colors"
          >
            {t('viewInGallery')}
            <ExternalLink size={12} />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 text-(--color-warm-gray) hover:text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Object grid */}
      <div className="p-5">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {displayObjects.map((obj) => (
            <Link
              key={obj.objectnummer}
              href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}`}
              className="group block border border-(--color-border) hover:shadow-md transition-all duration-200 corner-fold"
            >
              <div className="relative aspect-square bg-(--color-cream-dark) overflow-hidden">
                <ObjectImage
                  src={obj.thumbnailUrl}
                  alt={obj.titles[0] || obj.objectnummer}
                  fill
                  sizes="120px"
                  className="group-hover:scale-105 transition-transform duration-300"
                  isPublicDomain={obj.isPublicDomain}
                />
              </div>
              <div className="p-1.5">
                <p className="text-xs text-(--color-charcoal) line-clamp-2 font-medium leading-tight">
                  {obj.titles[0] || obj.objectnummer}
                </p>
                <p className="text-xs text-(--color-warm-gray-light) mt-0.5">
                  {obj.year || 'n.d.'}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Show more/less */}
        {objects.length > 12 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm font-medium text-(--color-rijks-red) hover:underline"
            >
              {showAll
                ? t('showLess')
                : t('showMore', { remaining: objects.length - 12 })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   HEATMAP LAYER
   ================================================================== */
function HeatLayerWrapper({
  points,
  L,
}: {
  points: [number, number, number][];
  L: LeafletModule;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length || !L) return;

    const heatLayer = (
      L as unknown as {
        heatLayer: (
          latlngs: [number, number, number][],
          options?: Record<string, unknown>,
        ) => { addTo: (m: typeof map) => unknown };
      }
    ).heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 13,
      max: 1.0,
    });

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(
        heatLayer as unknown as Parameters<typeof map.removeLayer>[0],
      );
    };
  }, [map, points, L]);

  return null;
}

/* ==================================================================
   MAP INNER (dynamic leaflet)
   ================================================================== */
function MapInner({
  locations,
  selectedLocation,
  getFilteredObjects,
  onSelectLocation,
  regionFilter,
  viewMode,
  t,
}: {
  locations: LocationGroup[];
  selectedLocation: LocationGroup | null;
  getFilteredObjects: (loc: LocationGroup) => CollectionObject[];
  onSelectLocation: (loc: LocationGroup | null) => void;
  regionFilter: 'suriname' | 'netherlands' | 'both';
  viewMode: 'markers' | 'heatmap';
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [L, setL] = useState<LeafletModule | null>(null);

  useEffect(() => {
    Promise.all([
      import('leaflet'),
      // @ts-expect-error -- Leaflet.heat is not typed
      import('leaflet.heat'),
    ]).then(([leaflet]) => {
      const mod = (leaflet as { default?: LeafletModule }).default ?? leaflet;
      setL(() => mod as LeafletModule);
    });
  }, []);

  const locationMetrics = useMemo(
    () =>
      locations.map((loc) => ({
        loc,
        filteredCount: getFilteredObjects(loc).length,
      })),
    [locations, getFilteredObjects],
  );

  const maxCount = useMemo(
    () => Math.max(...locationMetrics.map((m) => m.filteredCount), 1),
    [locationMetrics],
  );

  const heatmapPoints = useMemo(
    () =>
      locationMetrics.map(
        ({ loc, filteredCount }) =>
          [loc.geo.lat, loc.geo.lng, filteredCount / maxCount] as [
            number,
            number,
            number,
          ],
      ),
    [locationMetrics, maxCount],
  );

  if (!L) {
    return (
      <div className="w-full h-135 bg-(--color-cream-dark) flex items-center justify-center">
        <Globe
          size={32}
          className="text-(--color-warm-gray-light) animate-pulse"
        />
      </div>
    );
  }

  // Map center and zoom based on region
  let center: [number, number];
  let zoom: number;
  if (regionFilter === 'both') {
    center = [25, -25];
    zoom = 3;
  } else if (regionFilter === 'netherlands') {
    center = [52.2, 4.9];
    zoom = 8;
  } else {
    center = [5.5, -55.2];
    zoom = 7;
  }

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-135 border border-(--color-border)"
        key={`${regionFilter}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {viewMode === 'heatmap' && (
          <HeatLayerWrapper points={heatmapPoints} L={L} />
        )}
        {viewMode === 'markers' &&
          locationMetrics.map(({ loc, filteredCount }) => {
            const isSelected = selectedLocation?.id === loc.id;
            const radius = Math.max(
              6,
              Math.min(30, (filteredCount / maxCount) * 30),
            );
            const isSuriname = loc.geo.region === 'suriname';

            return (
              <CircleMarker
                key={loc.id}
                center={[loc.geo.lat, loc.geo.lng]}
                radius={isSelected ? radius + 3 : radius}
                pathOptions={{
                  fillColor: isSuriname ? '#c0503e' : '#c99a2e',
                  fillOpacity: isSelected ? 0.9 : 0.6,
                  color: isSelected
                    ? '#1b3a35'
                    : isSuriname
                      ? '#9a3e31'
                      : '#a07d20',
                  weight: isSelected ? 3 : 1,
                }}
                eventHandlers={{
                  click: () => {
                    onSelectLocation(isSelected ? null : loc);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -radius]}>
                  <span className="font-semibold">{loc.geo.name}</span>
                  <br />
                  <span className="text-xs text-gray-500">
                    {filteredCount} {filteredCount === 1 ? 'object' : 'objects'}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}
      </MapContainer>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 z-1000 bg-white/90 backdrop-blur-sm border border-(--color-border) px-3 py-2 text-xs text-(--color-warm-gray) flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-(--color-rijks-red)" />
          {t('suriname')}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-(--color-gold)" />
          {t('netherlands')}
        </div>
        <span className="text-(--color-warm-gray-light)">
          {viewMode === 'markers' ? t('markerSize') : t('heatDensity')}
        </span>
      </div>
    </div>
  );
}
