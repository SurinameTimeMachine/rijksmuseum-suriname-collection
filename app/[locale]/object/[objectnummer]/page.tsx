import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getObjectByNumber, getRelatedObjects } from '@/lib/collection';
import ObjectImage from '@/components/ObjectImage';
import ObjectCard from '@/components/ObjectCard';
import {
  ArrowLeft,
  Calendar,
  Palette,
  MapPin,
  Tag,
  Users,
  ExternalLink,
  Layers,
} from 'lucide-react';

// Return empty array so pages are rendered on-demand instead of at build time.
// This avoids exceeding Vercel's 75 MB deploy size limit (~7 300+ objects × 2 locales).
export function generateStaticParams() {
  return [];
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; objectnummer: string }>;
}) {
  const { objectnummer } = await params;
  const obj = await getObjectByNumber(decodeURIComponent(objectnummer));
  if (!obj) return { title: 'Not Found' };
  return {
    title: obj.titles[0] || obj.objectnummer,
    description: obj.description?.slice(0, 200),
  };
}

export default async function ObjectPage({
  params,
}: {
  params: Promise<{ locale: string; objectnummer: string }>;
}) {
  const { locale, objectnummer } = await params;
  setRequestLocale(locale);

  const obj = await getObjectByNumber(decodeURIComponent(objectnummer));
  if (!obj) notFound();

  const t = await getTranslations({ locale, namespace: 'object' });
  const related = await getRelatedObjects(obj, 6);

  const title = obj.titles[0] || obj.objectnummer;
  const alternativeTitles = obj.titles.slice(1);
  const creator =
    obj.creators.filter((c) => c !== 'anoniem').join(', ') || t('anonymous');
  const dateDisplay =
    obj.dateStart === obj.dateEnd
      ? obj.dateStart
      : `${obj.dateStart} — ${obj.dateEnd}`;

  // Rijksmuseum website link
  const rijksUrl = `https://www.rijksmuseum.nl/nl/collectie/${obj.objectnummer}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href={`/${locale}/gallery`}
        className="inline-flex items-center gap-1.5 text-sm text-(--color-warm-gray) hover:text-(--color-charcoal) transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        {t('back')}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Image */}
        <div className="lg:col-span-3">
          <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark) border border-(--color-border) corner-fold">
            <ObjectImage
              src={obj.imageUrl || obj.thumbnailUrl}
              alt={title}
              fill
              priority
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
            {!obj.hasImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-(--color-warm-gray)">{t('noImage')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl lg:text-3xl leading-snug!">{title}</h1>
            {alternativeTitles.length > 0 && (
              <div className="mt-2 space-y-1">
                {alternativeTitles.map((alt, i) => (
                  <p
                    key={i}
                    className="text-sm italic text-(--color-warm-gray)"
                  >
                    {alt}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Creator & date */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-(--color-charcoal)">
              <Users size={14} className="text-(--color-warm-gray)" />
              {creator}
            </div>
            {dateDisplay && (
              <div className="flex items-center gap-1.5 text-(--color-charcoal)">
                <Calendar size={14} className="text-(--color-warm-gray)" />
                {dateDisplay}
              </div>
            )}
          </div>

          {/* Object number */}
          <p className="text-xs text-(--color-warm-gray-light) font-mono">
            {obj.objectnummer}
          </p>

          {/* Description */}
          {obj.description && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                {t('description')}
              </h4>
              <p className="text-sm text-(--color-charcoal-light) leading-relaxed whitespace-pre-line">
                {obj.description.split('$')[0]}
              </p>
            </div>
          )}

          {/* Metadata tags */}
          <div className="space-y-4 border-t border-(--color-border) pt-4">
            {obj.objectTypes.length > 0 && (
              <MetadataRow
                icon={<Layers size={14} />}
                label={t('objectType')}
                values={obj.objectTypes}
              />
            )}
            {obj.materials.length > 0 && (
              <MetadataRow
                icon={<Palette size={14} />}
                label={t('materials')}
                values={obj.materials}
              />
            )}
            {obj.geographicKeywords.length > 0 && (
              <MetadataRow
                icon={<MapPin size={14} />}
                label={t('locations')}
                values={obj.geographicKeywords}
              />
            )}
            {obj.subjects.length > 0 && (
              <MetadataRow
                icon={<Tag size={14} />}
                label={t('subjects')}
                values={obj.subjects}
              />
            )}
            {obj.persons.length > 0 && (
              <MetadataRow
                icon={<Users size={14} />}
                label={t('persons')}
                values={obj.persons}
              />
            )}
          </div>

          {/* External link */}
          <a
            href={rijksUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors"
          >
            <ExternalLink size={14} />
            {t('viewOnRijksmuseum')}
          </a>
        </div>
      </div>

      {/* Related objects */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-(--color-border) pt-12">
          <h2 className="mb-6">{t('relatedObjects')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {related.map((obj) => (
              <ObjectCard key={obj.objectnummer} object={obj} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetadataRow({
  icon,
  label,
  values,
}: {
  icon: React.ReactNode;
  label: string;
  values: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-1.5">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-block px-3 py-1.5 bg-(--color-cream-dark) text-xs text-(--color-charcoal-light)"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
