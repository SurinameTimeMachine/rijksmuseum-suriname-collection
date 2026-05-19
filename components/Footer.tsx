import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-(--color-border) bg-(--color-cream-dark) shrink-0">
      <div className="px-4 py-2 flex items-center justify-between gap-4 text-xs text-(--color-warm-gray)">
        <span className="font-serif text-(--color-charcoal-light) font-medium truncate">
          {t('title')}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="https://data.rijksmuseum.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--color-charcoal) transition-colors underline"
          >
            {t('rijksmuseumOpenData')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://surinametijdmachine.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--color-charcoal) transition-colors underline"
          >
            {t('tijdmachine')}
          </a>
        </div>
      </div>
    </footer>
  );
}
