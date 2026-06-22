'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface ObjectBackLinkProps {
  locale: string;
  label: string;
}

export default function ObjectBackLink({
  locale,
  label,
}: ObjectBackLinkProps) {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const localePrefix = `/${locale}`;
  const isSafeLocalePath =
    !!from &&
    from.startsWith(localePrefix) &&
    (from.length === localePrefix.length ||
      from[localePrefix.length] === '/' ||
      from[localePrefix.length] === '?');
  const href = isSafeLocalePath ? from : `/${locale}/gallery`;

  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-ink/55 transition-colors hover:text-teal-strong"
    >
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
