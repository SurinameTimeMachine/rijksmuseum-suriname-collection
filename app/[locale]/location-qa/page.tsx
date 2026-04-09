import {
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';

import LocationQaEditor from '@/components/LocationQaEditor';
import { getCollection } from '@/lib/collection';
import { loadSurinameLocationTerms } from '@/lib/location-curation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'locationQa' });
  return { title: t('title') };
}

export default async function LocationQaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'locationQa' });
  const objects = await getCollection();
  const surinameTerms = loadSurinameLocationTerms();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="!text-2xl md:!text-3xl leading-tight">{t('title')}</h1>
        <p className="mt-2 text-sm md:text-base text-(--color-warm-gray)">
          {t('subtitle')}
        </p>
      </div>

      <LocationQaEditor objects={objects} surinameTerms={surinameTerms} />
    </div>
  );
}
