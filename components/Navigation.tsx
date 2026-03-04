'use client';

import { cn } from '@/lib/utils';
import {
  BarChart3,
  Clock,
  Globe,
  Grid3X3,
  MapPin,
  Menu,
  X,
  Crosshair,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/gallery', labelKey: 'gallery' as const, icon: Grid3X3 },
  { href: '/timeline', labelKey: 'timeline' as const, icon: Clock },
  { href: '/map', labelKey: 'map' as const, icon: MapPin },
  { href: '/geoposition', labelKey: 'geoposition' as const, icon: Crosshair },
  { href: '/statistics', labelKey: 'statistics' as const, icon: BarChart3 },
];

export default function Navigation() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const otherLocale = locale === 'en' ? 'nl' : 'en';

  // Build the locale-switched path
  const switchLocalePath = pathname.replace(`/${locale}`, `/${otherLocale}`);

  return (
    <header className="sticky top-0 z-50 bg-(--color-cream)/95 backdrop-blur-md border-b border-(--color-border)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home */}
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
              <span className="uppercase">{otherLocale}</span>
            </Link>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-(--color-charcoal-light) hover:bg-(--color-cream-dark)"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 border-t border-(--color-border) pt-3">
            {navItems.map((item) => {
              const href = `/${locale}${item.href}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
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
          </nav>
        )}
      </div>
    </header>
  );
}
