'use client';

import 'leaflet/dist/leaflet.css';
import type { HoneycombBackgroundCell } from '@/types/collection';
import { useEffect } from 'react';
import {
  CircleMarker,
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

export interface MapPoint {
  label: string;
  lat: number;
  lng: number;
  count: number;
}

interface HoneycombMapProps {
  hexes: HexCell[];
  backgroundHexes: HoneycombBackgroundCell[];
  selectedHexId: string | null;
  onSelectHex: (hexId: string | null) => void;
  onZoomChange: (zoom: number) => void;
  focusTarget?: { lat: number; lng: number; zoom?: number; key: string } | null;
  /** Anything that, when changed, should trigger Leaflet to re-measure (e.g. side panel open/close). */
  resizeSignal?: unknown;
  /** Per-location point overlay; when null/undefined the layer is hidden. */
  points?: MapPoint[] | null;
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

function FocusController({
  target,
}: {
  target: HoneycombMapProps['focusTarget'];
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo(
      [target.lat, target.lng],
      target.zoom ?? Math.max(map.getZoom(), 10),
      {
        duration: 0.8,
      },
    );
  }, [map, target?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ResizeInvalidator({ signal }: { signal: unknown }) {
  const map = useMap();
  useEffect(() => {
    // Wait one tick for the CSS transition to start so Leaflet sees the new size.
    const id = window.setTimeout(() => map.invalidateSize(), 320);
    return () => window.clearTimeout(id);
  }, [map, signal]);
  return null;
}

export default function HoneycombMap({
  hexes,
  backgroundHexes,
  selectedHexId,
  onSelectHex,
  onZoomChange,
  focusTarget,
  resizeSignal,
  points,
}: HoneycombMapProps) {
  const maxCount = Math.max(1, ...hexes.map((h) => h.count));
  const maxPointCount = Math.max(1, ...(points?.map((p) => p.count) ?? [1]));

  return (
    <MapContainer
      center={[4.5, -55.5]}
      zoom={7}
      minZoom={5}
      maxZoom={13}
      className="w-full h-full"
      worldCopyJump={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomTracker onZoom={onZoomChange} />
      <FocusController target={focusTarget ?? null} />
      <ResizeInvalidator signal={resizeSignal} />

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
              className: isSelected ? 'hex-selected' : undefined,
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

      {/* Per-location point overlay (toggleable) */}
      {points?.map((p) => {
        const ratio = Math.log(1 + p.count) / Math.log(1 + maxPointCount);
        const radius = 4 + ratio * 14;
        return (
          <CircleMarker
            key={`pt-${p.label}-${p.lat}-${p.lng}`}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{
              color: '#7a1d12',
              weight: 1,
              fillColor: '#c0503e',
              fillOpacity: 0.75,
            }}
          >
            <Tooltip direction="top" sticky>
              <span className="font-semibold">{p.label}</span>
              <span className="ml-1 text-(--color-warm-gray)">· {p.count}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
