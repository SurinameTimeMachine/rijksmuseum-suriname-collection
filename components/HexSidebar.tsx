'use client';

import ObjectImage from '@/components/ObjectImage';
import type { MapTimelineObject } from '@/types/collection';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';

interface HexSidebarProps {
  open: boolean;
  objects: MapTimelineObject[];
  onClose: () => void;
}

function dominantLabel(objects: MapTimelineObject[]): string {
  if (objects.length === 0) return '';
  const counts = new Map<string, number>();
  for (const o of objects) {
    counts.set(o.locationLabel, (counts.get(o.locationLabel) || 0) + 1);
  }
  return [...counts.entries()].sort(([, a], [, b]) => b - a)[0][0];
}

export default function HexSidebar({
  open,
  objects,
  onClose,
}: HexSidebarProps) {
  const t = useTranslations('hexSidebar');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const label = dominantLabel(objects);
  const currentHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  return (
    <aside
      className={`relative shrink-0 h-full bg-(--color-card) border-l border-(--color-border) shadow-2xl overflow-hidden transition-[width] duration-300 ease-out ${
        open ? 'w-full sm:w-96' : 'w-0 pointer-events-none'
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      {open ? (
        <div className="w-full sm:w-96 h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border)">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-(--color-warm-gray-light)">
                {t('approximateLocation')}
              </p>
              <h3 className="font-serif text-lg font-bold text-(--color-charcoal) truncate">
                {label || t('untitledArea')}
              </h3>
              <p className="text-xs text-(--color-warm-gray) mt-0.5">
                {t('objectsHere', { count: objects.length })}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="p-1.5 text-(--color-warm-gray) hover:text-(--color-charcoal) hover:bg-(--color-cream-dark) transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {objects.length === 0 ? (
              <p className="text-sm text-(--color-warm-gray) text-center py-8">
                {t('emptyHex')}
              </p>
            ) : (
              objects.map((obj) => (
                <Link
                  key={obj.objectnummer}
                  href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}?${new URLSearchParams({ from: currentHref }).toString()}`}
                  className="flex gap-3 p-2 border border-(--color-border) hover:shadow-md hover:border-(--color-warm-gray-light) transition-all bg-white"
                >
                  <div className="relative w-20 h-20 shrink-0 bg-(--color-cream-dark) overflow-hidden">
                    <ObjectImage
                      src={obj.thumbnailUrl}
                      alt={obj.title}
                      fill
                      sizes="80px"
                      isPublicDomain={obj.isPublicDomain}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-(--color-charcoal) line-clamp-2 leading-tight">
                      {obj.title}
                    </p>
                    <p className="text-xs text-(--color-warm-gray) mt-1">
                      {obj.year}
                    </p>
                    {obj.creators.length > 0 &&
                      obj.creators[0] !== 'anoniem' && (
                        <p className="text-xs text-(--color-warm-gray-light) truncate">
                          {obj.creators[0]}
                        </p>
                      )}
                    <p className="text-xs text-(--color-warm-gray-light) truncate italic">
                      {obj.locationLabel}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
