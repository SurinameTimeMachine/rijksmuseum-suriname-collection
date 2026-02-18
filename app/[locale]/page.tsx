import ObjectCard from '@/components/ObjectCard';
import ScrollReveal, { SectionLabel } from '@/components/ScrollReveal';
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

  // Hero card — the most prominent featured object
  const heroObj = featured[0];
  const sideObjs = featured.slice(1, 4);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-(--color-charcoal)">
        {/* Subtle map pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml,%3Csvg%20viewBox=%270%200%20400%20400%27%20xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%270.3%27%20numOctaves=%274%27%20stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect%20width=%27100%25%27%20height=%27100%25%27%20filter=%27url(%23n)%27/%3E%3C/svg%3E')]" />
        <div className="absolute inset-0 bg-linear-to-br from-(--color-charcoal) via-(--color-charcoal)/90 to-(--color-gold)/15" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <div className="max-w-3xl">
            <p className="text-(--color-gold) font-semibold text-xs uppercase tracking-[0.2em] mb-5 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-(--color-gold)/50" />
              {t('subtitle')}
            </p>
            <h1 className="text-white text-4xl md:text-6xl lg:text-7xl leading-tight!">
              {t('title')}
            </h1>
            <p className="mt-6 text-lg text-white/70 leading-relaxed max-w-2xl">
              {t('intro', { count: stats.totalObjects.toLocaleString() })}
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href={`/${locale}/gallery`}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-(--color-rijks-red) text-white font-semibold rounded-xl hover:bg-(--color-rijks-red-dark) transition-all hover:shadow-lg hover:shadow-(--color-rijks-red)/20"
              >
                <Grid3X3 size={18} />
                {t('browseGallery')}
                <ArrowRight size={16} />
              </Link>
              <Link
                href={`/${locale}/timeline`}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-all backdrop-blur-sm border border-white/10"
              >
                <Clock size={18} />
                {t('exploreTimeline')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <ScrollReveal>
        <section className="bg-(--color-card) border-b border-(--color-border)">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
      </ScrollReveal>

      {/* About blurb — editorial narrative */}
      <ScrollReveal>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <SectionLabel
            number="01"
            label={
              locale === 'nl' ? 'OVER DE COLLECTIE' : 'ABOUT THE COLLECTION'
            }
          />
          <div className="max-w-3xl">
            <h2 className="mt-2">
              {locale === 'nl'
                ? 'Suriname in het Rijksmuseum'
                : 'Suriname in the Rijksmuseum'}
            </h2>
            <p className="mt-4 text-(--color-charcoal-light) leading-relaxed text-lg">
              {locale === 'nl'
                ? "Het Rijksmuseum bewaart ruim 3.600 objecten die verbonden zijn met de geschiedenis van Suriname — van schilderijen en prenten tot foto's, kaarten en gebruiksvoorwerpen. Deze collectie-verkenner maakt ze doorzoekbaar, geeft ze een plek op de kaart en verbindt ze met het project "
                : 'The Rijksmuseum holds over 3,600 objects connected to the history of Suriname — from paintings and prints to photographs, maps and everyday objects. This collection explorer makes them searchable, places them on the map and connects them with the '}
              <a
                href="https://surinametijdmachine.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-(--color-rijks-red) hover:underline"
              >
                Suriname Tijdmachine
              </a>
              {locale === 'nl' ? '.' : ' project.'}
            </p>
          </div>
        </section>
      </ScrollReveal>

      {/* Featured Objects — asymmetric layout */}
      <ScrollReveal>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <SectionLabel
                number="02"
                label={locale === 'nl' ? 'UITGELICHT' : 'FEATURED'}
              />
              <h2 className="mt-2">{t('featuredObjects')}</h2>
            </div>
            <Link
              href={`/${locale}/gallery`}
              className="flex items-center gap-1 text-sm font-semibold text-(--color-rijks-red) hover:underline"
            >
              {t('browseGallery')}
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Asymmetric: large hero card + side cards on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {heroObj && (
              <div className="lg:col-span-3">
                <ObjectCard object={heroObj} />
              </div>
            )}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
              {sideObjs.map((obj) => (
                <ObjectCard key={obj.objectnummer} object={obj} />
              ))}
            </div>
          </div>

          {/* Second row — remaining featured */}
          {featured.length > 4 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
              {featured.slice(4).map((obj) => (
                <ObjectCard key={obj.objectnummer} object={obj} />
              ))}
            </div>
          )}
        </section>
      </ScrollReveal>

      {/* Explore sections */}
      <ScrollReveal>
        <section className="bg-(--color-cream-dark) py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionLabel
              number="03"
              label={locale === 'nl' ? 'VERKEN' : 'EXPLORE'}
            />
            <h2 className="mt-2 mb-8">
              {locale === 'nl'
                ? 'Ontdek de collectie'
                : 'Discover the collection'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ExploreCard
                href={`/${locale}/timeline`}
                icon={<Clock size={28} />}
                title={t('exploreTimeline')}
                description={`${stats.dateRange.earliest} — ${stats.dateRange.latest}`}
              />
              <ExploreCard
                href={`/${locale}/map`}
                icon={<MapPin size={28} />}
                title={t('viewMap')}
                description="Suriname & Netherlands"
              />
              <ExploreCard
                href={`/${locale}/statistics`}
                icon={<BarChart3 size={28} />}
                title={t('viewStatistics')}
                description={`${stats.totalObjects} objects`}
              />
            </div>
          </div>
        </section>
      </ScrollReveal>
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
      <div className="inline-flex items-center justify-center w-11 h-11 bg-(--color-cream) rounded-xl text-(--color-charcoal-light) mb-3">
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
      className="group flex items-start gap-5 p-7 bg-(--color-card) rounded-2xl border border-(--color-border) hover:border-(--color-warm-gray-light) hover:shadow-lg transition-all duration-300"
    >
      <div className="shrink-0 w-14 h-14 bg-(--color-cream) rounded-xl flex items-center justify-center text-(--color-charcoal) group-hover:bg-(--color-charcoal) group-hover:text-white transition-colors duration-300">
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
