import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('metadata');

  return (
    <footer className="border-t border-(--color-border) bg-(--color-cream-dark)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="font-serif font-bold text-lg text-(--color-charcoal)">
              Rijksmuseum Suriname Collection
            </p>
            <p className="text-sm text-(--color-warm-gray) mt-1">
              {t('description')}
            </p>
            <p className="text-xs text-(--color-warm-gray-light) mt-2">
              {'Part of the '}
              <a
                href="https://surinametijdmachine.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-(--color-charcoal-light) hover:text-(--color-rijks-red) transition-colors"
              >
                Suriname Tijdmachine
              </a>
              {' project'}
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
                Rijksmuseum Image Policy
              </a>
              {' — mostly Public Domain (CC0)'}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
