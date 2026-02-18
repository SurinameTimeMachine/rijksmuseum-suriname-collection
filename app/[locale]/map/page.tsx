import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getObjectsByLocation } from '@/lib/collection';
import { geoCoordinates } from '@/data/geo-coordinates';
import MapClient from '@/components/MapClient';
import ScrollReveal from '@/components/ScrollReveal';

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

  // Match geographic keywords to coordinates
  const locations = Object.entries(objectsByLocation)
    .filter(([keyword]) => geoCoordinates[keyword])
    .map(([keyword, objects]) => ({
      keyword,
      geo: { ...geoCoordinates[keyword], objectCount: objects.length },
      objects,
    }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">{t('subtitle')}</p>
        </div>
      </ScrollReveal>

      <MapClient locations={locations} />
    </div>
  );
}
