'use client';

import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
}: PaginationProps) {
  const t = useTranslations('gallery');
  const tc = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function buildHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    return `/${locale}${basePath}?${params.toString()}`;
  }

  // Compute visible page numbers
  const pages: (number | 'ellipsis')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('ellipsis');
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-2 py-8">
      {/* Previous */}
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className="flex items-center gap-1 border border-slate-200 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/70 transition-colors hover:border-teal-strong/40 hover:text-teal-strong"
        >
          <ChevronLeft size={16} />
          {tc('previous')}
        </Link>
      ) : (
        <span className="flex cursor-not-allowed items-center gap-1 border border-slate-200 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/35">
          <ChevronLeft size={16} />
          {tc('previous')}
        </span>
      )}

      {/* Page numbers */}
      {pages.map((page, idx) =>
        page === 'ellipsis' ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-2 py-2 text-sm text-ink/35"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(page)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] transition-colors border',
              page === currentPage
                ? 'border-teal-strong bg-teal-strong text-white'
                : 'border-slate-200 text-ink/70 hover:border-teal-strong/40 hover:text-teal-strong',
            )}
          >
            {page}
          </Link>
        ),
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className="flex items-center gap-1 border border-slate-200 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/70 transition-colors hover:border-teal-strong/40 hover:text-teal-strong"
        >
          {tc('next')}
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="flex cursor-not-allowed items-center gap-1 border border-slate-200 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/35">
          {tc('next')}
          <ChevronRight size={16} />
        </span>
      )}

      {/* Page info */}
      <span className="ml-4 text-xs uppercase tracking-[0.2em] text-ink/55">
        {t('page', { current: currentPage, total: totalPages })}
      </span>
    </div>
  );
}
