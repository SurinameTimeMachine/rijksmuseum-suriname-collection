'use client';

import type { CollectionObject, GeoLocation } from '@/types/collection';
import dynamic from 'next/dynamic';

interface LocationGroup {
  id: string;
  keywords: string[];
  geo: GeoLocation;
  objects: CollectionObject[];
}

interface MapClientWrapperProps {
  locations: LocationGroup[];
}

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <div className="w-full h-135 bg-(--color-cream-dark)" />,
});

export default function MapClientWrapper({ locations }: MapClientWrapperProps) {
  return <MapClient locations={locations} />;
}
