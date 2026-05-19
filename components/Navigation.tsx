'use client';

import { cn } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/gallery', labelKey: 'gallery' as const },
  { href: '/statistics', labelKey: 'statistics' as const },
];

export default function Navigation() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isExplore = pathname === `/${locale}` || pathname === `/${locale}/`;

  const otherLocale = locale === 'en' ? 'nl' : 'en';
  const switchLocalePath = pathname.replace(`/${locale}`, `/${otherLocale}`);

  const openMobileMenu = () => {
    setMobileOpen(true);
  };

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  return (
    <header className="relative z-40 h-16 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href={`/${locale}`}
              className="flex shrink-0 items-center gap-2"
            >
              <div className="h-3 w-3 -skew-x-12 bg-teal-strong" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-ink">
                STM
              </span>
            </Link>

            <nav className="hidden min-w-0 items-center gap-2 whitespace-nowrap text-sm sm:flex">
              <a
                href="https://surinametijdmachine.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink/60 transition-colors hover:text-ink"
              >
                About
              </a>
              <span className="text-ink/20" aria-hidden="true">
                •
              </span>
              <Link
                href={`/${locale}`}
                className={cn(
                  'transition-colors',
                  isExplore
                    ? 'font-semibold text-ink'
                    : 'text-ink/60 hover:text-ink',
                )}
              >
                Images
              </Link>
              <span className="text-ink/20" aria-hidden="true">
                •
              </span>
              <a
                href="https://data.surinametijdmachine.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink/60 transition-colors hover:text-ink"
              >
                Data
              </a>
            </nav>
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-4 text-xs uppercase tracking-[0.2em] md:flex lg:gap-6">
            {navItems.map((item) => {
              const href = `/${locale}${item.href}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'px-1.5 py-1 font-medium transition-colors',
                    isActive ? 'text-ink' : 'text-ink/60 hover:text-ink',
                  )}
                >
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language toggle + mobile menu button */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={switchLocalePath}
              className="px-2 py-1 text-xs font-medium uppercase tracking-[0.25em] text-ink/45 transition-colors hover:text-ink"
              title={t('language')}
            >
              {otherLocale}
            </Link>

            <button
              onClick={mobileOpen ? closeMobileMenu : openMobileMenu}
              className="p-2 text-ink/60 transition-colors hover:bg-teal-strong/10 hover:text-teal-strong md:hidden"
              aria-label="Toggle menu"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                {mobileOpen ? 'Close' : 'Menu'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="absolute left-0 right-0 top-16 z-55 border-b border-slate-200 bg-white/98 shadow-lg backdrop-blur-sm md:hidden">
          <nav className="mx-auto max-w-6xl space-y-1 px-4 py-3 sm:px-6">
            <a
              href={`/${locale}`}
              onClick={closeMobileMenu}
              className={cn(
                'flex items-center gap-3 rounded px-3 py-3 text-sm font-medium transition-colors',
                isExplore
                  ? 'bg-teal-strong text-white'
                  : 'text-ink/70 hover:bg-sand',
              )}
            >
              Images
            </a>

            {navItems.map((item) => {
              const href = `/${locale}${item.href}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={closeMobileMenu}
                  className={cn(
                    'flex items-center gap-3 rounded px-3 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-teal-strong text-white'
                      : 'text-ink/70 hover:bg-sand',
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}

            <div className="my-2 border-t border-slate-200" />

            <a
              href="https://surinametijdmachine.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded px-3 py-3 text-sm font-medium text-ink/70 transition-colors hover:bg-sand"
            >
              About
            </a>
            <a
              href="https://data.surinametijdmachine.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded px-3 py-3 text-sm font-medium text-ink/70 transition-colors hover:bg-sand"
            >
              Data
            </a>

            <Link
              href={switchLocalePath}
              onClick={closeMobileMenu}
              className="flex items-center gap-3 rounded px-3 py-3 text-sm font-medium text-ink/70 transition-colors hover:bg-sand"
            >
              <span>
                {t('language')} -{' '}
                <span className="uppercase font-semibold">{otherLocale}</span>
              </span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
