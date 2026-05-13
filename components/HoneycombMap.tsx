'use client';

import 'leaflet/dist/leaflet.css';
import type { HoneycombBackgroundCell } from '@/types/collection';
import { useEffect } from 'react';
import {
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';

export interface HexCell {
  id: string;
  boundary: [number, number][];
  count: number;
}

interface HoneycombMapProps {
  hexes: HexCell[];
  backgroundHexes: HoneycombBackgroundCell[];
  selectedHexId: string | null;
  onSelectHex: (hexId: string | null) => void;
  onZoomChange: (zoom: number) => void;
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  useMapEvents({
    zoomend: (e) => onZoom(e.target.getZoom()),
  });
  return null;
}

export default function HoneycombMap({
  hexes,
  backgroundHexes,
  selectedHexId,
  onSelectHex,
  onZoomChange,
}: HoneycombMapProps) {
  const maxCount = Math.max(1, ...hexes.map((h) => h.count));

  return (
    <MapContainer
      center={[4.5, -55.5]}
      zoom={7}
      minZoom={5}
      maxZoom={13}
      className="w-full h-full"
      worldCopyJump={false}
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomTracker onZoom={onZoomChange} />

      {/* Background grid: empty neighbor hexes for structural honeycomb feel */}
      {backgroundHexes.map((hex) => (
        <Polygon
          key={`bg-${hex.id}`}
          positions={hex.boundary}
          pathOptions={{
            color: '#7a6e62',
            weight: 0.8,
            opacity: 0.3,
            fillColor: '#c8bfb0',
            fillOpacity: 0.05,
            interactive: false,
          }}
        />
      ))}

      {/* Data hexes */}
      {hexes.map((hex) => {
        const ratio = Math.log(1 + hex.count) / Math.log(1 + maxCount);
        const fillOpacity = 0.3 + ratio * 0.55;
        const isSelected = selectedHexId === hex.id;
        return (
          <Polygon
            key={hex.id}
            positions={hex.boundary}
            pathOptions={{
              color: isSelected ? '#1b3a35' : '#9a3e31',
              weight: isSelected ? 2.5 : 1.2,
              fillColor: '#c0503e',
              fillOpacity: isSelected ? 0.9 : fillOpacity,
            }}
            eventHandlers={{
              click: () => onSelectHex(isSelected ? null : hex.id),
            }}
          >
            <Tooltip direction="top" sticky>
              <span className="font-semibold">
                {hex.count} {hex.count === 1 ? 'object' : 'objects'}
              </span>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
