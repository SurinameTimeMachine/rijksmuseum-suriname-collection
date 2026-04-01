'use client';

import ObjectImage from '@/components/ObjectImage';
import type { CollectionObject } from '@/types/collection';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface TimelineEvent {
  year: string;
  label: string;
}

interface DecadeGroup {
  decade: string;
  startYear: number;
  count: number;
  objects: CollectionObject[];
}

const HISTORICAL_EVENTS: TimelineEvent[] = [
  { year: '1667', label: '' },
  { year: '1683', label: '' },
  { year: '1863', label: '' },
  { year: '1873', label: '' },
  { year: '1883', label: '' },
  { year: '1954', label: '' },
  { year: '1975', label: '' },
];

export default function TimelineClient({
  data,
}: {
  data: { year: number; count: number; objects: CollectionObject[] }[];
}) {
  const t = useTranslations('timeline');
  const locale = useLocale();
  const [expandedDecade, setExpandedDecade] = useState<string | null>(null);

  // Group by decade
  const decades: DecadeGroup[] = useMemo(() => {
    const grouped = new Map<number, CollectionObject[]>();
    for (const item of data) {
      const decadeStart = Math.floor(item.year / 10) * 10;
      if (!grouped.has(decadeStart)) grouped.set(decadeStart, []);
      grouped.get(decadeStart)!.push(...item.objects);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([startYear, objects]) => ({
        decade: `${startYear}s`,
        startYear,
        count: objects.length,
        objects,
      }));
  }, [data]);

  const events = HISTORICAL_EVENTS.map((e) => ({
    ...e,
    label: t(`events.${e.year}`),
  }));

  return (
    <div className="space-y-1">
      {decades.map((group) => {
        const isExpanded = expandedDecade === group.decade;
        const relevantEvents = events.filter((e) => {
          const y = parseInt(e.year, 10);
          return y >= group.startYear && y < group.startYear + 10;
        });

        return (
          <div key={group.decade}>
            {/* Decade header */}
            <button
              onClick={() =>
                setExpandedDecade(isExpanded ? null : group.decade)
              }
              className="w-full flex items-center gap-4 py-5 px-4 hover:bg-(--color-cream-dark) transition-colors group"
            >
              {/* Timeline dot */}
              <div className="relative flex items-center">
                <div className="w-4 h-4 rounded-full bg-(--color-charcoal) group-hover:bg-(--color-rijks-red) transition-colors shrink-0" />
                <div className="absolute left-1.5 top-3 w-px h-8 bg-(--color-border) -z-10" />
              </div>

              {/* Decade label */}
              <span className="font-serif text-xl font-bold text-(--color-charcoal) w-20 text-left">
                {group.decade}
              </span>

              {/* Bar */}
              <div className="flex-1 h-8 relative">
                <div
                  className="absolute inset-y-0 left-0 bg-(--color-rijks-red)/10 group-hover:bg-(--color-rijks-red)/20 rounded transition-colors"
                  style={{
                    width: `${Math.min(100, (group.count / Math.max(...decades.map((d) => d.count))) * 100)}%`,
                  }}
                />
                <div className="relative h-full flex items-center px-3">
                  <span className="text-sm text-(--color-charcoal-light)">
                    {t('objects', { count: group.count })}
                  </span>
                </div>
              </div>

              {/* Events */}
              {relevantEvents.length > 0 && (
                <div className="hidden md:block max-w-xs text-right">
                  {relevantEvents.map((evt) => (
                    <span
                      key={evt.year}
                      className="text-xs text-(--color-gold) font-medium"
                    >
                      ★ {evt.label}
                    </span>
                  ))}
                </div>
              )}
            </button>

            {/* Expanded: show objects */}
            {isExpanded && (
              <div className="ml-12 pb-6">
                {/* Events banner */}
                {relevantEvents.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {relevantEvents.map((evt) => (
                      <div
                        key={evt.year}
                        className="flex items-center gap-2 px-3 py-2 bg-(--color-gold)/10"
                      >
                        <span className="text-xs font-bold text-(--color-gold)">
                          {evt.year}
                        </span>
                        <span className="text-xs text-(--color-charcoal)">
                          {evt.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {group.objects.slice(0, 18).map((obj) => (
                    <Link
                      key={obj.objectnummer}
                      href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}`}
                      className="group/card block overflow-hidden border border-(--color-border) hover:shadow-lg transition-all duration-300 corner-fold"
                    >
                      <div className="relative aspect-square bg-(--color-cream-dark)">
                        <ObjectImage
                          src={obj.thumbnailUrl}
                          alt={obj.titles[0] || ''}
                          fill
                          className="group-hover/card:scale-105 transition-transform"
                          isPublicDomain={obj.isPublicDomain}
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-(--color-charcoal) line-clamp-2 font-medium">
                          {obj.titles[0] || obj.objectnummer}
                        </p>
                        <p className="text-xs text-(--color-warm-gray-light) mt-0.5">
                          {obj.year}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                {group.objects.length > 18 && (
                  <p className="mt-3 text-xs text-(--color-warm-gray)">
                    +{group.objects.length - 18} more objects in this decade
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
