'use client';

import { cn } from '@/lib/utils';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

interface FacetItem {
  value: string;
  count: number;
}

interface FilterSidebarProps {
  facets: {
    objectTypes: FacetItem[];
    creators: FacetItem[];
    geographicKeywords: FacetItem[];
    subjects: FacetItem[];
    materials: FacetItem[];
  };
}

export default function FilterSidebar({ facets }: FilterSidebarProps) {
  const t = useTranslations('gallery');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentQuery = searchParams.get('q') || '';
  const currentTypes = searchParams.getAll('type');
  const currentLocations = searchParams.getAll('location');
  const currentSubjects = searchParams.getAll('subject');
  const currentSort = searchParams.get('sort') || 'date-desc';

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('page'); // Reset page on filter change

      for (const [key, value] of Object.entries(updates)) {
        params.delete(key);
        if (value === null) continue;
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else {
          params.set(key, value);
        }
      }

      startTransition(() => {
        router.push(`/${locale}/gallery?${params.toString()}`);
      });
    },
    [searchParams, locale, router],
  );

  const toggleFilter = useCallback(
    (key: string, value: string) => {
      const current = searchParams.getAll(key);
      const newValues = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateParams({ [key]: newValues.length > 0 ? newValues : null });
    },
    [searchParams, updateParams],
  );

  const clearAll = useCallback(() => {
    startTransition(() => {
      router.push(`/${locale}/gallery`);
    });
  }, [locale, router]);

  const hasFilters =
    currentQuery ||
    currentTypes.length > 0 ||
    currentLocations.length > 0 ||
    currentSubjects.length > 0;

  const filterContent = (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-warm-gray-light)"
          />
          <input
            type="text"
            defaultValue={currentQuery}
            placeholder={t('searchPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value;
                updateParams({ q: val || null });
              }
            }}
            className="w-full pl-9 pr-3 py-2.5 bg-(--color-card) border border-(--color-border) text-sm text-(--color-charcoal) placeholder:text-(--color-warm-gray-light) focus:outline-none focus:ring-2 focus:ring-(--color-charcoal-light)/20 focus:border-(--color-charcoal-light)"
          />
        </div>
      </div>

      {/* Sort */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('sortBy')}
        </h4>
        <select
          value={currentSort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="w-full px-3 py-2 bg-(--color-card) border border-(--color-border) text-sm text-(--color-charcoal) focus:outline-none focus:ring-2 focus:ring-(--color-charcoal-light)/20"
        >
          <option value="date-desc">{t('sortDateDesc')}</option>
          <option value="date-asc">{t('sortDateAsc')}</option>
          <option value="title">{t('sortTitle')}</option>
        </select>
      </div>

      {/* Object Type */}
      <FacetGroup
        title={t('objectType')}
        items={facets.objectTypes.slice(0, 15)}
        selected={currentTypes}
        onToggle={(val) => toggleFilter('type', val)}
      />

      {/* Location */}
      <FacetGroup
        title={t('location')}
        items={facets.geographicKeywords.slice(0, 15)}
        selected={currentLocations}
        onToggle={(val) => toggleFilter('location', val)}
      />

      {/* Subject */}
      <FacetGroup
        title={t('subject')}
        items={facets.subjects.slice(0, 15)}
        selected={currentSubjects}
        onToggle={(val) => toggleFilter('subject', val)}
      />

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="w-full py-2.5 text-sm font-semibold text-(--color-rijks-red) hover:bg-(--color-rijks-red)/5 transition-colors"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-(--color-card) border border-(--color-border) text-sm font-medium text-(--color-charcoal) mb-4"
      >
        <SlidersHorizontal size={16} />
        {t('filters')}
        {hasFilters && (
          <span className="w-5 h-5 bg-(--color-rijks-red) text-white text-xs flex items-center justify-center">
            {currentTypes.length +
              currentLocations.length +
              currentSubjects.length +
              (currentQuery ? 1 : 0)}
          </span>
        )}
      </button>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'lg:block lg:w-72 shrink-0',
          mobileOpen ? 'block' : 'hidden',
        )}
      >
        <div className={cn('lg:sticky lg:top-20', isPending && 'opacity-60')}>
          {filterContent}
        </div>
      </aside>
    </>
  );
}

function FacetGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: FacetItem[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 6);

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
        {title}
      </h4>
      <div className="space-y-1">
        {visible.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-2 py-1 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={selected.includes(item.value)}
              onChange={() => onToggle(item.value)}
              className="w-3.5 h-3.5 rounded border-(--color-border) text-(--color-charcoal-light) focus:ring-(--color-charcoal-light)/20"
            />
            <span className="text-sm text-(--color-charcoal-light) group-hover:text-(--color-charcoal) flex-1 truncate">
              {item.value}
            </span>
            <span className="text-xs text-(--color-warm-gray-light)">
              {item.count}
            </span>
          </label>
        ))}
      </div>
      {items.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-(--color-rijks-red) hover:underline"
        >
          {expanded ? 'Show less' : `+${items.length - 6} more`}
        </button>
      )}
    </div>
  );
}
