import {
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';

import MapClientWrapper from '@/components/MapClientWrapper';
import ScrollReveal from '@/components/ScrollReveal';
import { getObjectsByLocation } from '@/lib/collection';
import type { CollectionObject } from '@/types/collection';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'map' });
  return { title: t('title') };
}

export default async function MapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'map' });
  const objectsByLocation = await getObjectsByLocation();

  // Build map buckets per object-specific resolved detail.
  // This avoids pinning all objects with the same keyword to objects[0].
  const locationBuckets = new Map<
    string,
    {
      keyword: string;
      geo: {
        name: string;
        lat: number;
        lng: number;
        region: 'suriname' | 'netherlands' | 'other';
        objectCount: number;
      };
      objects: CollectionObject[];
    }
  >();

  for (const [keyword, objects] of Object.entries(objectsByLocation)) {
    for (const obj of objects) {
      const detail = obj.geoKeywordDetails.find((d) => d.term === keyword);
      if (!detail || detail.lat == null || detail.lng == null) continue;

      const name = detail.matchedLabel?.trim() || detail.term;
      const region = detail.region ?? ('other' as const);
      const bucketKey = `${name}::${detail.lat}::${detail.lng}::${region}`;

      if (!locationBuckets.has(bucketKey)) {
        locationBuckets.set(bucketKey, {
          keyword: bucketKey,
          geo: {
            name,
            lat: detail.lat,
            lng: detail.lng,
            region,
            objectCount: 0,
          },
          objects: [],
        });
      }

      const bucket = locationBuckets.get(bucketKey)!;
      bucket.objects.push(obj);
      bucket.geo.objectCount = bucket.objects.length;
    }
  }

  const locations = Array.from(locationBuckets.values());

  return (
    <div className="max-w-350 mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">{t('subtitle')}</p>
        </div>
      </ScrollReveal>

      <MapClientWrapper locations={locations} />
    </div>
  );
}
