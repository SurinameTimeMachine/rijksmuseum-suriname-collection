import ScrollReveal from '@/components/ScrollReveal';
import StatsClient from '@/components/StatsClient';
import { getCurationStats, getStatistics } from '@/lib/collection';
import { getRawCollectionStats } from '@/lib/raw-collection';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'statistics' });
  return { title: t('title') };
}

export default async function StatisticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'statistics' });
  const [stats, rawStats, curation] = await Promise.all([
    getStatistics(),
    getRawCollectionStats(),
    getCurationStats(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-10">
      <ScrollReveal>
        <div className="mb-12 max-w-3xl">
          <p className="flag-label mb-4 text-ink/60">Data Narrative</p>
          <h1 className="text-4xl font-semibold sm:text-5xl">{t('title')}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink/75">
            {t('subtitle')}
          </p>
        </div>
      </ScrollReveal>

      <StatsClient stats={stats} rawStats={rawStats} curation={curation} />
    </div>
  );
}
