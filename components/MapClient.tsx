'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { CollectionObject, GeoLocation } from '@/types/collection';

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface MapClientProps {
  locations: {
    keyword: string;
    geo: GeoLocation;
    objects: CollectionObject[];
  }[];
}

export default function MapClient({ locations }: MapClientProps) {
  const t = useTranslations('map');
  const locale = useLocale();
  const mounted = useIsMounted();
  const [showSuriname, setShowSuriname] = useState(true);
  const [showNetherlands, setShowNetherlands] = useState(false);

  if (!mounted) {
    return (
      <div className="w-full h-150 bg-(--color-cream-dark) rounded-xl flex items-center justify-center">
        <p className="text-(--color-warm-gray)">Loading map…</p>
      </div>
    );
  }

  return (
    <MapInner
      locations={locations}
      showSuriname={showSuriname}
      setShowSuriname={setShowSuriname}
      showNetherlands={showNetherlands}
      setShowNetherlands={setShowNetherlands}
      locale={locale}
      t={t}
    />
  );
}

function MapInner({
  locations,
  showSuriname,
  setShowSuriname,
  showNetherlands,
  setShowNetherlands,
  locale,
  t,
}: {
  locations: MapClientProps['locations'];
  showSuriname: boolean;
  setShowSuriname: (v: boolean) => void;
  showNetherlands: boolean;
  setShowNetherlands: (v: boolean) => void;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [MapContainer, setMapContainer] = useState<
    typeof import('react-leaflet').MapContainer | null
  >(null);
  const [TileLayer, setTileLayer] = useState<
    typeof import('react-leaflet').TileLayer | null
  >(null);
  const [CircleMarker, setCircleMarker] = useState<
    typeof import('react-leaflet').CircleMarker | null
  >(null);
  const [Popup, setPopup] = useState<
    typeof import('react-leaflet').Popup | null
  >(null);

  useEffect(() => {
    // Dynamically import react-leaflet and leaflet CSS
    import('react-leaflet').then((mod) => {
      setMapContainer(() => mod.MapContainer);
      setTileLayer(() => mod.TileLayer);
      setCircleMarker(() => mod.CircleMarker);
      setPopup(() => mod.Popup);
    });
    // @ts-expect-error -- CSS import has no type declarations
    import('leaflet/dist/leaflet.css');
  }, []);

  if (!MapContainer || !TileLayer || !CircleMarker || !Popup) {
    return (
      <div className="w-full h-150 bg-(--color-cream-dark) rounded-xl flex items-center justify-center">
        <p className="text-(--color-warm-gray)">Loading map…</p>
      </div>
    );
  }

  const filtered = locations.filter((loc) => {
    if (loc.geo.region === 'suriname' && showSuriname) return true;
    if (loc.geo.region === 'netherlands' && showNetherlands) return true;
    return false;
  });

  const maxCount = Math.max(...filtered.map((l) => l.objects.length), 1);

  // Center on Suriname by default
  const center: [number, number] = showSuriname ? [5.5, -55.2] : [52.2, 4.9];
  const zoom = showSuriname ? 7 : 8;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showSuriname}
            onChange={(e) => setShowSuriname(e.target.checked)}
            className="rounded border-(--color-border) text-(--color-rijks-red)"
          />
          {t('showSuriname')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showNetherlands}
            onChange={(e) => setShowNetherlands(e.target.checked)}
            className="rounded border-(--color-border) text-(--color-rijks-red)"
          />
          {t('showNetherlands')}
        </label>
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-150 rounded-xl border border-(--color-border)"
        key={`${showSuriname}-${showNetherlands}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filtered.map((loc) => {
          const radius = Math.max(
            6,
            Math.min(30, (loc.objects.length / maxCount) * 30),
          );
          return (
            <CircleMarker
              key={loc.keyword}
              center={[loc.geo.lat, loc.geo.lng]}
              radius={radius}
              pathOptions={{
                fillColor:
                  loc.geo.region === 'suriname' ? '#E30613' : '#C8A951',
                fillOpacity: 0.6,
                color: loc.geo.region === 'suriname' ? '#B50510' : '#A08930',
                weight: 1,
              }}
            >
              <Popup>
                <div className="max-w-xs">
                  <h3 className="font-bold text-sm mb-1">{loc.geo.name}</h3>
                  <p className="text-xs text-gray-600 mb-2">
                    {loc.objects.length} objects
                  </p>
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {loc.objects.slice(0, 3).map((obj) => (
                      <Link
                        key={obj.objectnummer}
                        href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}`}
                        className="text-xs text-blue-600 hover:underline truncate"
                      >
                        {obj.titles[0]?.slice(0, 30) || obj.objectnummer}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href={`/${locale}/gallery?location=${encodeURIComponent(loc.keyword)}`}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    View all →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-(--color-warm-gray)">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-(--color-rijks-red)" />
          {t('suriname')}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-(--color-gold)" />
          {t('netherlands')}
        </div>
        <span className="text-xs">Marker size = number of objects</span>
      </div>
    </div>
  );
}
