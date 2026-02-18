import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('metadata');

  return (
    <footer className="border-t border-(--color-border) bg-(--color-cream-dark)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="font-serif font-bold text-(--color-charcoal)">
              Rijksmuseum Suriname Collection
            </p>
            <p className="text-sm text-(--color-warm-gray) mt-1">
              {t('description')}
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-2 text-sm text-(--color-warm-gray)">
            <p>
              Data:{' '}
              <a
                href="https://data.rijksmuseum.nl"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-(--color-charcoal) transition-colors"
              >
                Rijksmuseum Open Data
              </a>
            </p>
            <p>
              Images:{' '}
              <a
                href="https://www.rijksmuseum.nl/en/research/image-requests"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-(--color-charcoal) transition-colors"
              >
                Public Domain (CC0)
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
