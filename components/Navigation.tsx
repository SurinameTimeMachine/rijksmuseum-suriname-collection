'use client';

import { cn } from '@/lib/utils';
import {
  BarChart3,
  ChevronDown,
  Globe,
  Grid3X3,
  Menu,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const navItems = [
  { href: '/gallery', labelKey: 'gallery' as const, icon: Grid3X3 },
  { href: '/statistics', labelKey: 'statistics' as const, icon: BarChart3 },
];

const NAV_H = 64; // px — must match h-16

export default function Navigation() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExploreRef = useRef(false);

  const isExplore =
    pathname === `/${locale}` || pathname === `/${locale}/`;
  isExploreRef.current = isExplore;

  const otherLocale = locale === 'en' ? 'nl' : 'en';
  const switchLocalePath = pathname.replace(`/${locale}`, `/${otherLocale}`);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setMobileOpen(false);
      setNavHidden(true);
    }, 3000);
  }, [clearHideTimer]);

  const revealNav = useCallback(() => {
    clearHideTimer();
    setNavHidden(false);
    if (isExploreRef.current) scheduleHide();
  }, [clearHideTimer, scheduleHide]);

  // Auto-hide on explore page; always show on other pages
  useEffect(() => {
    if (!isExplore) {
      clearHideTimer();
      setNavHidden(false);
      return;
    }
    scheduleHide();
    return clearHideTimer;
  }, [isExplore, scheduleHide, clearHideTimer]);

  // Desktop: reveal when mouse approaches the very top (< 6 px)
  useEffect(() => {
    if (!isExplore) return;
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < 6 && navHidden) revealNav();
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [isExplore, navHidden, revealNav]);

  // Fire a synthetic resize so Leaflet calls invalidateSize() after transition
  const onTransitionEnd = () => {
    window.dispatchEvent(new Event('resize'));
  };

  const openMobileMenu = () => {
    clearHideTimer();
    setNavHidden(false);
    setMobileOpen(true);
  };

  const closeMobileMenu = () => {
    setMobileOpen(false);
    if (isExplore) scheduleHide();
  };

  return (
    <>
      {/*
        Spacer: reserves 64 px in the flex column on non-explore pages so
        content starts below the fixed header. On the explore page it collapses
        to 0 so the map fills the full viewport and the header overlays it.
      */}
      <div
        className="shrink-0 transition-[height] duration-300 ease-in-out"
        style={{ height: isExplore ? 0 : NAV_H }}
        aria-hidden="true"
      />

      {/* Fixed header — always overlays content, slides out on explore page */}
      <header
        className="fixed top-0 left-0 right-0 z-[50] h-16 bg-(--color-cream)/95 backdrop-blur-md border-b border-(--color-border) transition-transform duration-300 ease-in-out"
        style={{ transform: navHidden ? 'translateY(-100%)' : 'translateY(0)' }}
        onTransitionEnd={onTransitionEnd}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3 group shrink-0"
            >
              <div className="w-9 h-9 bg-(--color-charcoal) flex items-center justify-center">
                <span className="text-white font-serif font-bold text-sm">
                  SC
                </span>
              </div>
              <div className="hidden sm:block">
                <span className="font-serif font-bold text-lg text-(--color-charcoal) group-hover:text-(--color-rijks-red) transition-colors">
                  Suriname Collection
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const href = `/${locale}${item.href}`;
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2 px-3.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-(--color-charcoal) text-white'
                        : 'text-(--color-charcoal-light) hover:bg-(--color-cream-dark) hover:text-(--color-charcoal)',
                    )}
                  >
                    <item.icon size={16} />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>

            {/* Language toggle + mobile menu button */}
            <div className="flex items-center gap-2">
              <Link
                href={switchLocalePath}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors"
                title={t('language')}
              >
                <Globe size={16} />
                <span className="uppercase font-semibold">{otherLocale}</span>
              </Link>

              <button
                onClick={mobileOpen ? closeMobileMenu : openMobileMenu}
                className="md:hidden p-2 text-(--color-charcoal-light) hover:bg-(--color-cream-dark)"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Reveal tab — appears at top centre when nav is hidden on explore page */}
      {isExplore && navHidden && (
        <button
          onClick={revealNav}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 bg-(--color-cream)/90 backdrop-blur-sm border border-(--color-border) border-t-0 px-4 py-1 text-xs text-(--color-charcoal-light) hover:text-(--color-charcoal) transition-colors rounded-b-md shadow-sm"
          aria-label={t('showNav')}
        >
          <ChevronDown size={13} />
          <span className="sr-only">{t('showNav')}</span>
        </button>
      )}

      {/* Mobile dropdown — fixed, drops below the header */}
      {mobileOpen && (
        <div className="fixed top-16 left-0 right-0 z-[55] bg-(--color-cream)/98 backdrop-blur-md border-b border-(--color-border) shadow-lg md:hidden">
          <nav className="max-w-7xl mx-auto px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const href = `/${locale}${item.href}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={closeMobileMenu}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors rounded',
                    isActive
                      ? 'bg-(--color-charcoal) text-white'
                      : 'text-(--color-charcoal-light) hover:bg-(--color-cream-dark)',
                  )}
                >
                  <item.icon size={18} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
            {/* Language toggle in mobile menu too */}
            <Link
              href={switchLocalePath}
              onClick={closeMobileMenu}
              className="flex items-center gap-3 px-3 py-3 text-sm font-medium text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors rounded"
            >
              <Globe size={18} />
              <span>
                {t('language')} —{' '}
                <span className="uppercase font-semibold">{otherLocale}</span>
              </span>
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
