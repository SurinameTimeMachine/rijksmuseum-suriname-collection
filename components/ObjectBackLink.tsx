'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

interface ObjectBackLinkProps {
  locale: string;
  label: string;
}

export default function ObjectBackLink({
  locale,
  label,
}: ObjectBackLinkProps) {
  const router = useRouter();
  const localePrefix = `/${locale}`;

  function returnToPreviousPage(event: MouseEvent<HTMLAnchorElement>) {
    if (!document.referrer) return;

    try {
      const previousUrl = new URL(document.referrer);
      const isSameLocalePage =
        previousUrl.origin === window.location.origin &&
        (previousUrl.pathname === localePrefix ||
          previousUrl.pathname.startsWith(`${localePrefix}/`));
      if (!isSameLocalePage) return;

      event.preventDefault();
      router.back();
    } catch {
      // Keep the gallery link when the referrer is not a valid URL.
    }
  }

  return (
    <Link
      href={`/${locale}/gallery`}
      onClick={returnToPreviousPage}
      className="mb-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-ink/55 transition-colors hover:text-teal-strong"
    >
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
