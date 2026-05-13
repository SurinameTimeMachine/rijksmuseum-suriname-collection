import ExploreView from '@/components/ExploreView';
import { getMapTimelineObjects, getStatistics } from '@/lib/collection';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: t('title'),
    description: t('subtitle', { count: '—' }),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'home' });
  const [objects, stats] = await Promise.all([
    getMapTimelineObjects(),
    getStatistics(),
  ]);

  const years = objects.map((o) => o.year);
  const minYear = years.length ? Math.min(...years) : stats.dateRange.earliest;
  const maxYear = years.length ? Math.max(...years) : stats.dateRange.latest;

  return (
    <div className="flex flex-col">
      <section className="border-b border-(--color-border) bg-(--color-card)">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-(--color-charcoal) leading-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-(--color-warm-gray) mt-1">
              {t('subtitle', { count: objects.length.toLocaleString() })}
            </p>
          </div>
          <Link
            href={`/${locale}/statistics`}
            className="text-xs font-semibold uppercase tracking-wider text-(--color-rijks-red) hover:text-(--color-rijks-red-dark) self-start md:self-auto"
          >
            {t('aboutData')} →
          </Link>
        </div>
      </section>

      <ExploreView objects={objects} minYear={minYear} maxYear={maxYear} />
    </div>
  );
}
