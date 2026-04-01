import Link from 'next/link';
import { getLocationQaObjects } from '@/lib/collection';
import { AlertTriangle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

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
  const objects = await getLocationQaObjects();

  const unresolvedTermCounts = new Map<string, number>();
  for (const obj of objects) {
    for (const detail of obj.geoKeywordDetails) {
      if (detail.source === 'unresolved') {
        unresolvedTermCounts.set(
          detail.term,
          (unresolvedTermCounts.get(detail.term) || 0) + 1,
        );
      }
    }
  }

  const topUnresolved = Array.from(unresolvedTermCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1>{t('title')}</h1>
        <p className="mt-2 text-(--color-warm-gray)">{t('subtitle')}</p>
      </div>

      {objects.length === 0 ? (
        <div className="text-center py-16 border border-(--color-border) bg-(--color-card)">
          <p className="text-(--color-charcoal)">{t('noIssues')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-1 border border-(--color-border) bg-(--color-card) p-4 h-fit">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-3">
              {t('unresolvedTerms')}
            </h2>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
              {topUnresolved.map(([term, count]) => (
                <div
                  key={term}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span className="text-(--color-charcoal-light) truncate pr-2">
                    {term}
                  </span>
                  <span className="text-(--color-warm-gray-light)">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-3">
              {t('objects')} ({objects.length})
            </h2>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {objects.map((obj) => {
                const unresolvedTerms = obj.geoKeywordDetails
                  .filter((d) => d.source === 'unresolved')
                  .map((d) => d.term);

                return (
                  <article
                    key={obj.objectnummer}
                    className="border border-(--color-border) bg-(--color-card) p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-serif text-(--color-charcoal)">
                          {obj.titles[0] || obj.objectnummer}
                        </h3>
                        <p className="text-xs text-(--color-warm-gray-light) mt-1 font-mono">
                          {obj.objectnummer}
                        </p>
                      </div>
                      <Link
                        href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}`}
                        className="text-xs font-semibold text-(--color-rijks-red) hover:underline shrink-0"
                      >
                        {t('openObject')}
                      </Link>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {unresolvedTerms.map((term) => (
                        <span
                          key={`${obj.objectnummer}-${term}`}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-300 text-amber-800 text-xs"
                        >
                          <AlertTriangle size={11} />
                          {term}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
