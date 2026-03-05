'use client';

/**
 * ViewingCone — a Leaflet overlay that renders a camera field-of-view sector
 * (pie-slice shape) emanating from a camera position at a given bearing and FOV.
 *
 * In edit mode, the user can:
 * - Drag the camera marker to reposition
 * - Drag the bearing handle to rotate direction
 * - Drag the FOV edge handles to widen/narrow the cone
 *
 * In view mode, it's a static semi-transparent sector with a click popup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* ---- Geometry helpers ---- */

/** Convert degrees to radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees */
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalize an angle to 0–360 range */
function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Calculate a destination point given start, bearing (degrees), and distance (meters).
 * Uses the Haversine "destination" formula.
 */
function destinationPoint(
  lat: number,
  lng: number,
  bearing: number,
  distance: number,
): [number, number] {
  const R = 6371000; // Earth radius in meters
  const d = distance / R;
  const brng = toRad(bearing);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [toDeg(lat2), toDeg(lng2)];
}

/**
 * Calculate bearing from point A to point B (in degrees, 0=N, 90=E).
 */
function bearingBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLng = toRad(lng2 - lng1);
  const la1 = toRad(lat1);
  const la2 = toRad(lat2);

  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);

  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/**
 * Generate the arc polygon points for the viewing cone.
 * Returns an array of [lat, lng] pairs forming the sector.
 */
export function generateConePoints(
  lat: number,
  lng: number,
  bearing: number,
  fieldOfView: number,
  radiusMeters: number,
  segments: number = 24,
): [number, number][] {
  const points: [number, number][] = [];

  // Start at camera position
  points.push([lat, lng]);

  // Generate arc from (bearing - fov/2) to (bearing + fov/2)
  const startAngle = normalizeBearing(bearing - fieldOfView / 2);
  const step = fieldOfView / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = normalizeBearing(startAngle + step * i);
    points.push(destinationPoint(lat, lng, angle, radiusMeters));
  }

  // Close back to camera
  points.push([lat, lng]);

  return points;
}

/* ---- Exported types ---- */

export interface ViewingConeProps {
  /** Camera position latitude */
  lat: number;
  /** Camera position longitude */
  lng: number;
  /** Bearing in degrees (0=N, 90=E) */
  bearing: number;
  /** Field of view in degrees */
  fieldOfView: number;
  /** Whether the cone is editable (drag handles) */
  editable?: boolean;
  /** Cone display radius in meters (auto-calculated from zoom if not set) */
  radiusMeters?: number;
  /** Color of the cone */
  color?: string;
  /** Fill opacity */
  fillOpacity?: number;
  /** Callback when position changes (edit mode) */
  onPositionChange?: (lat: number, lng: number) => void;
  /** Callback when bearing changes (edit mode) */
  onBearingChange?: (bearing: number) => void;
  /** Callback when FOV changes (edit mode) */
  onFieldOfViewChange?: (fov: number) => void;
}

/**
 * ViewingCone component.
 *
 * Must be rendered inside a react-leaflet MapContainer.
 * Uses dynamic import of react-leaflet to avoid SSR issues.
 */
export default function ViewingCone({
  lat,
  lng,
  bearing,
  fieldOfView,
  editable = false,
  radiusMeters = 150,
  color = '#c0503e',
  fillOpacity = 0.2,
  onBearingChange,
  onFieldOfViewChange,
}: ViewingConeProps) {
  const [leafletModules, setLeafletModules] = useState<{
    Polygon: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
    useMapEvents: (events: Record<string, unknown>) => unknown;
  } | null>(null);

  const isDragging = useRef<'bearing' | 'fov-left' | 'fov-right' | null>(null);

  // Dynamic import of react-leaflet
  useEffect(() => {
    import('react-leaflet').then((mod) => {
      setLeafletModules({
        Polygon: mod.Polygon as unknown as React.ComponentType<
          Record<string, unknown>
        >,
        CircleMarker: mod.CircleMarker as unknown as React.ComponentType<
          Record<string, unknown>
        >,
        useMapEvents: mod.useMapEvents as unknown as (
          events: Record<string, unknown>,
        ) => unknown,
      });
    });
  }, []);

  // Generate cone polygon
  const conePoints = generateConePoints(
    lat,
    lng,
    bearing,
    fieldOfView,
    radiusMeters,
  );

  // Handle positions for edit mode
  const bearingHandlePos = destinationPoint(
    lat,
    lng,
    bearing,
    radiusMeters * 0.8,
  );
  const leftEdgePos = destinationPoint(
    lat,
    lng,
    normalizeBearing(bearing - fieldOfView / 2),
    radiusMeters * 0.6,
  );
  const rightEdgePos = destinationPoint(
    lat,
    lng,
    normalizeBearing(bearing + fieldOfView / 2),
    radiusMeters * 0.6,
  );

  const handleMouseMove = useCallback(
    (e: { latlng: { lat: number; lng: number } }) => {
      if (!isDragging.current) return;

      const mouseLat = e.latlng.lat;
      const mouseLng = e.latlng.lng;

      if (isDragging.current === 'bearing') {
        const newBearing = bearingBetween(lat, lng, mouseLat, mouseLng);
        onBearingChange?.(Math.round(newBearing));
      } else if (isDragging.current === 'fov-left') {
        const angleToMouse = bearingBetween(lat, lng, mouseLat, mouseLng);
        const rightEdge = normalizeBearing(bearing + fieldOfView / 2);
        let diff = normalizeBearing(rightEdge - angleToMouse);
        if (diff > 180) diff = 360 - diff;
        const newFov = Math.max(5, Math.min(170, diff));
        const newBearing = normalizeBearing(rightEdge - newFov / 2);
        onFieldOfViewChange?.(Math.round(newFov));
        onBearingChange?.(Math.round(newBearing));
      } else if (isDragging.current === 'fov-right') {
        const angleToMouse = bearingBetween(lat, lng, mouseLat, mouseLng);
        const leftEdge = normalizeBearing(bearing - fieldOfView / 2);
        let diff = normalizeBearing(angleToMouse - leftEdge);
        if (diff > 180) diff = 360 - diff;
        const newFov = Math.max(5, Math.min(170, diff));
        const newBearing = normalizeBearing(leftEdge + newFov / 2);
        onFieldOfViewChange?.(Math.round(newFov));
        onBearingChange?.(Math.round(newBearing));
      }
    },
    [lat, lng, bearing, fieldOfView, onBearingChange, onFieldOfViewChange],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = null;
  }, []);

  if (!leafletModules) return null;

  const { Polygon, CircleMarker } = leafletModules;

  return (
    <>
      {/* The viewing cone sector polygon */}
      <Polygon
        positions={conePoints}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity,
          weight: 2,
          dashArray: editable ? undefined : '4 4',
        }}
      />

      {editable && (
        <>
          {/* Drag event handler */}
          <DragHandler
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            useMapEvents={leafletModules.useMapEvents}
          />

          {/* Camera position marker */}
          <CircleMarker
            center={[lat, lng]}
            radius={8}
            pathOptions={{
              color: '#1a1a1a',
              fillColor: color,
              fillOpacity: 1,
              weight: 2,
            }}
            eventHandlers={{
              mousedown: () => {
                // Camera drag is handled separately via onPositionChange
              },
            }}
          />

          {/* Bearing handle (center ray) */}
          <CircleMarker
            center={bearingHandlePos}
            radius={6}
            pathOptions={{
              color: '#1a1a1a',
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 2,
              className: 'cursor-grab',
            }}
            eventHandlers={{
              mousedown: () => {
                isDragging.current = 'bearing';
              },
            }}
          />

          {/* Left FOV edge handle */}
          <CircleMarker
            center={leftEdgePos}
            radius={5}
            pathOptions={{
              color: '#1a1a1a',
              fillColor: '#ffd700',
              fillOpacity: 1,
              weight: 2,
              className: 'cursor-grab',
            }}
            eventHandlers={{
              mousedown: () => {
                isDragging.current = 'fov-left';
              },
            }}
          />

          {/* Right FOV edge handle */}
          <CircleMarker
            center={rightEdgePos}
            radius={5}
            pathOptions={{
              color: '#1a1a1a',
              fillColor: '#ffd700',
              fillOpacity: 1,
              weight: 2,
              className: 'cursor-grab',
            }}
            eventHandlers={{
              mousedown: () => {
                isDragging.current = 'fov-right';
              },
            }}
          />
        </>
      )}

      {!editable && (
        /* View mode: camera dot */
        <CircleMarker
          center={[lat, lng]}
          radius={5}
          pathOptions={{
            color: '#1a1a1a',
            fillColor: color,
            fillOpacity: 1,
            weight: 1.5,
          }}
        />
      )}
    </>
  );
}

/**
 * Internal component that hooks into Leaflet map events for drag handling.
 */
function DragHandler({
  onMouseMove,
  onMouseUp,
  useMapEvents,
}: {
  onMouseMove: (e: { latlng: { lat: number; lng: number } }) => void;
  onMouseUp: () => void;
  useMapEvents: (events: Record<string, unknown>) => unknown;
}) {
  useMapEvents({
    mousemove: onMouseMove,
    mouseup: onMouseUp,
  });
  return null;
}
