'use client';

import dynamic from 'next/dynamic';

interface LocationGroup {
  keyword: string;
  geo: { name: string; lat: number; lng: number; region: string; objectCount: number };
  objects: any[];
}

interface MapClientWrapperProps {
  locations: LocationGroup[];
}

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-135 bg-(--color-cream-dark)"></div>
  ),
}) as any;

export default function MapClientWrapper({ locations }: MapClientWrapperProps) {
  return <MapClient locations={locations} />;
}
