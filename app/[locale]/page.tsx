import ObjectCard from '@/components/ObjectCard';
import { getCollection, getStatistics } from '@/lib/collection';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Clock,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  MapPin,
} from 'lucide-react';
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
    description: t('intro', { count: '3,691' }),
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
  const stats = await getStatistics();
  const collection = await getCollection();

  // Featured objects: pick ones with images and interesting subjects
  const featured = collection
    .filter((obj) => obj.hasImage && obj.titles[0])
    .slice(0, 6);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-(--color-charcoal)">
        <div className="absolute inset-0 bg-linear-to-br from-(--color-charcoal) via-(--color-charcoal)/95 to-(--color-rijks-red)/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="max-w-3xl">
            <p className="text-(--color-gold) font-medium text-sm uppercase tracking-widest mb-4">
              {t('subtitle')}
            </p>
            <h1 className="text-white text-4xl md:text-6xl lg:text-7xl leading-tight!">
              {t('title')}
            </h1>
            <p className="mt-6 text-lg text-gray-300 leading-relaxed max-w-2xl">
              {t('intro', { count: stats.totalObjects.toLocaleString() })}
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href={`/${locale}/gallery`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-(--color-rijks-red) text-white font-medium rounded-lg hover:bg-(--color-rijks-red-dark) transition-colors"
              >
                <Grid3X3 size={18} />
                {t('browseGallery')}
                <ArrowRight size={16} />
              </Link>
              <Link
                href={`/${locale}/timeline`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                <Clock size={18} />
                {t('exploreTimeline')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white border-b border-(--color-border)">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            <StatCard
              icon={<Layers size={20} />}
              value={stats.totalObjects.toLocaleString()}
              label={t('objectTypes')}
              sublabel={`${Object.keys(stats.objectsByType).length} types`}
            />
            <StatCard
              icon={<Calendar size={20} />}
              value={`${stats.dateRange.earliest}–${stats.dateRange.latest}`}
              label={t('dateRange')}
            />
            <StatCard
              icon={<ImageIcon size={20} />}
              value={stats.objectsWithImages.toLocaleString()}
              label={t('withImages')}
            />
            <StatCard
              icon={<MapPin size={20} />}
              value={stats.topLocations.length.toString()}
              label="Locations"
            />
          </div>
        </div>
      </section>

      {/* Featured Objects */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2>{t('featuredObjects')}</h2>
          <Link
            href={`/${locale}/gallery`}
            className="flex items-center gap-1 text-sm font-medium text-(--color-rijks-red) hover:underline"
          >
            {t('browseGallery')}
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((obj) => (
            <ObjectCard key={obj.objectnummer} object={obj} />
          ))}
        </div>
      </section>

      {/* Explore sections */}
      <section className="bg-(--color-cream-dark) py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ExploreCard
              href={`/${locale}/timeline`}
              icon={<Clock size={24} />}
              title={t('exploreTimeline')}
              description={`${stats.dateRange.earliest} — ${stats.dateRange.latest}`}
            />
            <ExploreCard
              href={`/${locale}/map`}
              icon={<MapPin size={24} />}
              title={t('viewMap')}
              description="Suriname & Netherlands"
            />
            <ExploreCard
              href={`/${locale}/statistics`}
              icon={<BarChart3 size={24} />}
              title={t('viewStatistics')}
              description={`${stats.totalObjects} objects`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  sublabel,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 bg-(--color-cream) rounded-lg text-(--color-warm-gray) mb-2">
        {icon}
      </div>
      <p className="font-serif text-2xl font-bold text-(--color-charcoal)">
        {value}
      </p>
      <p className="text-sm text-(--color-warm-gray)">{label}</p>
      {sublabel && (
        <p className="text-xs text-(--color-warm-gray-light)">{sublabel}</p>
      )}
    </div>
  );
}

function ExploreCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 p-6 bg-white rounded-xl border border-(--color-border) hover:border-(--color-warm-gray-light) hover:shadow-md transition-all"
    >
      <div className="shrink-0 w-12 h-12 bg-(--color-cream) rounded-lg flex items-center justify-center text-(--color-charcoal) group-hover:bg-(--color-rijks-red) group-hover:text-white transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="font-serif text-lg font-semibold text-(--color-charcoal) group-hover:text-(--color-rijks-red) transition-colors">
          {title}
        </h3>
        <p className="text-sm text-(--color-warm-gray) mt-1">{description}</p>
      </div>
    </Link>
  );
}
