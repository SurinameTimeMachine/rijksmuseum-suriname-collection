import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ExternalLink,
  Globe,
  Layers,
  MapPin,
  Palette,
  Scale,
  Tag,
  Users,
} from 'lucide-react';
import {
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ObjectCard from '@/components/ObjectCard';
import ObjectImage from '@/components/ObjectImage';
import {
  getObjectByNumber,
  getRelatedObjects,
} from '@/lib/collection';
import { getLicenseShortName } from '@/lib/utils';

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
  const mappableDetail = obj.geoKeywordDetails.find(
    (d) => d.lat !== null && d.lng !== null,
  );
  const mapLocation = mappableDetail
    ? { lat: mappableDetail.lat as number, lng: mappableDetail.lng as number }
    : null;

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
              isPublicDomain={obj.isPublicDomain}
            />
            {!obj.hasImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-(--color-warm-gray)">{t('noImage')}</p>
              </div>
            )}
            {obj.hasImage && !obj.isPublicDomain && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-(--color-warm-gray) text-sm text-center px-4">
                  {t('imageRestricted')}
                </p>
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
            {obj.geoKeywordDetails.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-1.5">
                  <MapPin size={14} />
                  {t('locations')}
                </div>
                <div className="space-y-2">
                  {obj.geoKeywordDetails.map((detail) => {
                    return (
                      <div
                        key={`${detail.term}-${detail.source}`}
                        className="px-3 py-2 bg-(--color-cream-dark) text-xs"
                      >
                        <span className="text-(--color-charcoal-light) font-medium">
                          {detail.term}
                        </span>
                        {detail?.broaderTerm && (
                          <span className="text-(--color-warm-gray)">
                            {' '}
                            — {detail.broaderTerm}
                          </span>
                        )}
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 border border-(--color-border) text-(--color-warm-gray) text-[10px] uppercase tracking-wider">
                            {t(`locationSource.${detail.source}`)}
                          </span>
                        </div>
                        {detail.lat !== null && detail.lng !== null && (
                          <div className="text-(--color-warm-gray) mt-1">
                            {detail.lat.toFixed(4)}, {detail.lng.toFixed(4)}
                          </div>
                        )}
                        {detail.source === 'unresolved' && (
                          <div className="text-amber-700 mt-1">
                            {t('locationNeedsReview')}
                          </div>
                        )}
                        {detail.flags.includes('outside-suriname') && (
                          <div className="text-amber-700 mt-1">
                            {t('locationOutsideSuriname')}
                          </div>
                        )}
                        {detail.provenance && (
                          <div className="text-(--color-warm-gray) mt-1">
                            {detail.provenance.author} · {detail.provenance.timestamp}
                            {detail.provenance.remark
                              ? ` · ${detail.provenance.remark}`
                              : ''}
                          </div>
                        )}
                        {detail &&
                          (detail.stmGazetteerUrl ||
                            detail.wikidataUri ||
                            detail.gettyUri ||
                            detail.geonamesUri) && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {detail.stmGazetteerUrl && (
                                <a
                                  href={detail.stmGazetteerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                                >
                                  STM
                                  <ExternalLink size={9} />
                                </a>
                              )}
                              {detail.wikidataUri && (
                                <a
                                  href={detail.wikidataUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                                >
                                  Wikidata
                                  <ExternalLink size={9} />
                                </a>
                              )}
                              {detail.gettyUri && (
                                <a
                                  href={detail.gettyUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                                >
                                  Getty TGN
                                  <ExternalLink size={9} />
                                </a>
                              )}
                              {detail.geonamesUri && (
                                <a
                                  href={detail.geonamesUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                                >
                                  GeoNames
                                  <ExternalLink size={9} />
                                </a>
                              )}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {mapLocation && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-1.5">
                  <Globe size={14} />
                  {t('locationMap')}
                </div>
                <div className="border border-(--color-border) bg-(--color-cream-dark)">
                  <iframe
                    title={`${title} map`}
                    className="w-full h-52"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapLocation.lng - 0.1}%2C${mapLocation.lat - 0.1}%2C${mapLocation.lng + 0.1}%2C${mapLocation.lat + 0.1}&layer=mapnik&marker=${mapLocation.lat}%2C${mapLocation.lng}`}
                  />
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${mapLocation.lat}&mlon=${mapLocation.lng}#map=10/${mapLocation.lat}/${mapLocation.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline mt-1"
                >
                  {t('openInMap')}
                  <ExternalLink size={10} />
                </a>
              </div>
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
            {(() => {
              const licenseInfo = getLicenseShortName(
                obj.license,
                obj.licenseLabel,
              );
              return (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-(--color-warm-gray)">
                    <Scale size={14} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray)">
                      {t('license')}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {licenseInfo.isUnknown ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-medium">
                          <AlertTriangle size={12} />
                          {t('licenseUnknown')}
                        </span>
                      ) : (
                        <>
                          {licenseInfo.url ? (
                            <a
                              href={licenseInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border ${
                                obj.isPublicDomain
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-amber-50 border-amber-300 text-amber-800'
                              }`}
                            >
                              {licenseInfo.name}
                              <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border ${
                                obj.isPublicDomain
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-amber-50 border-amber-300 text-amber-800'
                              }`}
                            >
                              {licenseInfo.name}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* External links */}
          <div className="flex flex-wrap gap-3">
            <a
              href={rijksUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors"
            >
              <ExternalLink size={14} />
              {t('viewOnRijksmuseum')}
            </a>
            {obj.wikidataUrl && (
              <a
                href={obj.wikidataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 border border-(--color-border) text-(--color-charcoal) text-sm font-semibold hover:bg-(--color-cream-dark) transition-colors"
              >
                <Globe size={14} />
                Wikidata
              </a>
            )}
            {obj.wikimediaUrl && (
              <a
                href={obj.wikimediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 border border-(--color-border) text-(--color-charcoal) text-sm font-semibold hover:bg-(--color-cream-dark) transition-colors"
              >
                <Globe size={14} />
                Wikimedia Commons
              </a>
            )}
          </div>
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
