import FilterSidebar from '@/components/FilterSidebar';
import ObjectCard from '@/components/ObjectCard';
import Pagination from '@/components/Pagination';
import ScrollReveal from '@/components/ScrollReveal';
import { getFacets, getFilteredObjects } from '@/lib/collection';
import type { SortOption } from '@/types/collection';
import { ImageOff } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gallery' });
  return { title: t('title') };
}

interface GalleryPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GalleryPage({
  params,
  searchParams,
}: GalleryPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'gallery' });

  // Parse search params
  const query = typeof sp.q === 'string' ? sp.q : '';
  const types = Array.isArray(sp.type) ? sp.type : sp.type ? [sp.type] : [];
  const locations = Array.isArray(sp.location)
    ? sp.location
    : sp.location
      ? [sp.location]
      : [];
  const subjects = Array.isArray(sp.subject)
    ? sp.subject
    : sp.subject
      ? [sp.subject]
      : [];
  const licenses = Array.isArray(sp.license)
    ? sp.license
    : sp.license
      ? [sp.license]
      : [];
  const sort = (
    typeof sp.sort === 'string' ? sp.sort : 'date-desc'
  ) as SortOption;
  const page = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;

  const [{ objects, total, totalPages }, facets] = await Promise.all([
    getFilteredObjects(
      {
        query: query || undefined,
        objectTypes: types.length > 0 ? types : undefined,
        geographicKeywords: locations.length > 0 ? locations : undefined,
        subjects: subjects.length > 0 ? subjects : undefined,
        licenseStatuses:
          licenses.length > 0
            ? (licenses as Array<'public-domain' | 'copyrighted' | 'unknown'>)
            : undefined,
      },
      sort,
      page,
    ),
    getFacets(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <ScrollReveal>
        <div className="mb-8">
          <h1>{t('title')}</h1>
          <p className="mt-2 text-(--color-warm-gray)">
            {t('results', { count: total })}
          </p>
        </div>
      </ScrollReveal>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <Suspense>
          <FilterSidebar facets={facets} />
        </Suspense>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {objects.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {objects.map((obj) => (
                  <ObjectCard key={obj.objectnummer} object={obj} />
                ))}
              </div>

              <Suspense>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath="/gallery"
                />
              </Suspense>
            </>
          ) : (
            <div className="text-center py-20">
              <ImageOff
                size={48}
                className="mx-auto text-(--color-warm-gray-light) mb-4"
              />
              <p className="text-lg font-serif text-(--color-charcoal)">
                {t('noResults')}
              </p>
              <p className="mt-2 text-sm text-(--color-warm-gray)">
                {t('noResultsSuggestion')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
