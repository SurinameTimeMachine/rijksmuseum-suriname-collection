import ExploreView from '@/components/ExploreView';
import { getHoneycombData, getStatistics } from '@/lib/collection';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: t('title'),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [data, stats] = await Promise.all([
    getHoneycombData(),
    getStatistics(),
  ]);

  const years = data.objects.map((o) => o.year);
  const minYear = years.length ? Math.min(...years) : stats.dateRange.earliest;
  const maxYear = years.length ? Math.max(...years) : stats.dateRange.latest;

  return <ExploreView data={data} minYear={minYear} maxYear={maxYear} />;
}
