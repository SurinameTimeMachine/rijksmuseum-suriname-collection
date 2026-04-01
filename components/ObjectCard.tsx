import type { CollectionObject } from '@/types/collection';
import { getLicenseShortName } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import Link from 'next/link';
import ObjectImage from './ObjectImage';

interface ObjectCardProps {
  object: CollectionObject;
}

export default async function ObjectCard({ object }: ObjectCardProps) {
  const locale = await getLocale();
  const title = object.titles[0] || 'Untitled';
  const creator =
    object.creators.filter((c) => c !== 'anoniem').join(', ') || 'Anonymous';
  const dateDisplay = object.year || 'n.d.';
  const licenseInfo = getLicenseShortName(object.license, object.licenseLabel);

  return (
    <Link
      href={`/${locale}/object/${encodeURIComponent(object.objectnummer)}`}
      className="group block bg-(--color-card) overflow-hidden border border-(--color-border) shadow-sm hover:border-(--color-warm-gray-light) hover:shadow-lg transition-all duration-300 corner-fold"
    >
      {/* Image */}
      <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark)">
        <ObjectImage
          src={object.thumbnailUrl}
          alt={title}
          fill
          className="group-hover:scale-105 transition-transform duration-500 ease-out"
          isPublicDomain={object.isPublicDomain}
        />
        {/* Object type badge */}
        {object.objectTypes[0] && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 bg-(--color-charcoal)/75 text-white text-xs backdrop-blur-sm">
            {object.objectTypes[0]}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-serif font-semibold text-sm leading-snug text-(--color-charcoal) group-hover:text-(--color-rijks-red) transition-colors line-clamp-2">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-(--color-warm-gray)">{creator}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-(--color-warm-gray-light)">
          <span>{dateDisplay}</span>
          {licenseInfo.isUnknown ? (
            <span
              className="inline-flex items-center gap-0.5 text-amber-600"
              title="License unknown — needs review"
            >
              <AlertTriangle size={10} />
              <span className="font-medium">?</span>
            </span>
          ) : (
            <span
              className={`font-mono ${object.isPublicDomain ? 'text-(--color-warm-gray-light)' : 'text-amber-700'}`}
            >
              {licenseInfo.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
