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
      className={`relative h-full shrink-0 overflow-hidden border-l border-slate-200 bg-white shadow-[0_15px_35px_rgba(0,30,24,0.08)] transition-[width] duration-300 ease-out ${
        open ? 'w-full sm:w-96' : 'w-0 pointer-events-none'
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      {open ? (
        <div className="w-full sm:w-96 h-full flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/50">
                {t('approximateLocation')}
              </p>
              <h3 className="truncate text-lg font-semibold text-ink">
                {label || t('untitledArea')}
              </h3>
              <p className="mt-0.5 text-xs text-ink/60">
                {t('objectsHere', { count: objects.length })}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="shrink-0 p-1.5 text-ink/55 transition-colors hover:bg-sand hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {objects.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/60">
                {t('emptyHex')}
              </p>
            ) : (
              objects.map((obj) => (
                <Link
                  key={obj.objectnummer}
                  href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}?${new URLSearchParams({ from: currentHref }).toString()}`}
                  className="flex gap-3 border border-slate-200 bg-white p-2 transition-all hover:border-teal-strong/35 hover:shadow-[0_15px_35px_rgba(0,30,24,0.08)]"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-slate-100">
                    <ObjectImage
                      src={obj.thumbnailUrl}
                      alt={obj.title}
                      fill
                      sizes="80px"
                      isPublicDomain={obj.isPublicDomain}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-tight text-ink">
                      {obj.title}
                    </p>
                    <p className="mt-1 text-xs text-ink/65">{obj.year}</p>
                    {obj.creators.length > 0 &&
                      obj.creators[0] !== 'anoniem' && (
                        <p className="truncate text-xs text-ink/50">
                          {obj.creators[0]}
                        </p>
                      )}
                    <p className="truncate text-xs italic text-ink/50">
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
