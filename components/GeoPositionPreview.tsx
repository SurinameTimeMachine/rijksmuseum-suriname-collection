'use client';

/**
 * GeoPositionPreview — a small non-interactive map showing the camera position
 * and viewing cone for an already-positioned object.
 * Used on the object detail page.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { generateConePoints } from './ViewingCone';

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface GeoPositionPreviewProps {
  lat: number;
  lng: number;
  bearing: number;
  fieldOfView: number;
}

export default function GeoPositionPreview({
  lat,
  lng,
  bearing,
  fieldOfView,
}: GeoPositionPreviewProps) {
  const mounted = useIsMounted();
  const [mapModules, setMapModules] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (mounted) {
      import('react-leaflet').then((mod) => {
        setMapModules(mod as unknown as Record<string, unknown>);
      });
      // @ts-expect-error -- CSS import has no type declarations
      import('leaflet/dist/leaflet.css');
    }
  }, [mounted]);

  if (!mounted || !mapModules) {
    return <div className="h-[200px] bg-(--color-cream-dark) animate-pulse" />;
  }

  const MapContainer = mapModules.MapContainer as React.ComponentType<
    Record<string, unknown>
  >;
  const TileLayer = mapModules.TileLayer as React.ComponentType<
    Record<string, unknown>
  >;
  const Polygon = mapModules.Polygon as React.ComponentType<
    Record<string, unknown>
  >;
  const CircleMarker = mapModules.CircleMarker as React.ComponentType<
    Record<string, unknown>
  >;

  const conePoints = generateConePoints(lat, lng, bearing, fieldOfView, 100);

  return (
    <div className="h-[200px] relative">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Polygon
          positions={conePoints}
          pathOptions={{
            color: '#c0503e',
            fillColor: '#c0503e',
            fillOpacity: 0.2,
            weight: 2,
          }}
        />
        <CircleMarker
          center={[lat, lng]}
          radius={5}
          pathOptions={{
            color: '#1a1a1a',
            fillColor: '#c0503e',
            fillOpacity: 1,
            weight: 1.5,
          }}
        />
      </MapContainer>
    </div>
  );
}
