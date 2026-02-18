import ScrollReveal from '@/components/ScrollReveal';
import TimelineClient from '@/components/TimelineClient';
import { getStatistics, getTimelineData } from '@/lib/collection';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'timeline' });
  return { title: t('title') };
}

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'timeline' });
  const [data, stats] = await Promise.all([getTimelineData(), getStatistics()]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ScrollReveal>
        <div className="mb-10">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">
            {t('subtitle', {
              start: stats.dateRange.earliest,
              end: stats.dateRange.latest,
            })}
          </p>
        </div>
      </ScrollReveal>

      <TimelineClient data={data} />
    </div>
  );
}
