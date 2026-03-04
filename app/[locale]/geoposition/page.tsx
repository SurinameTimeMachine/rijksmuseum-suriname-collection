import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCollection } from '@/lib/collection';
import {
  getUnpositionedObjects,
  getPositioningProgress,
} from '@/lib/geo-positions';
import GeoPositionEditor from '@/components/GeoPositionEditor';
import ScrollReveal from '@/components/ScrollReveal';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'geoposition' });
  return { title: t('title') };
}

export default async function GeoPositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ object?: string }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'geoposition' });
  const collection = await getCollection();
  const unpositioned = await getUnpositionedObjects(collection);
  const progress = await getPositioningProgress(collection.length);

  // Limit to first 50 objects for the client payload (avoid sending the whole collection)
  const candidates = unpositioned.slice(0, 50);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">{t('subtitle')}</p>
        </div>
      </ScrollReveal>

      <GeoPositionEditor
        objects={candidates}
        initialObjectNummer={resolvedSearchParams.object}
        totalObjects={progress.total}
        positionedCount={progress.positioned}
      />
    </div>
  );
}
