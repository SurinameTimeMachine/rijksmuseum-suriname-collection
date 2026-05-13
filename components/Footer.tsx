export default function Footer() {
  return (
    <footer className="border-t border-(--color-border) bg-(--color-cream-dark) shrink-0">
      <div className="px-4 py-2 flex items-center justify-between gap-4 text-xs text-(--color-warm-gray)">
        <span className="font-serif text-(--color-charcoal-light) font-medium truncate">
          Suriname Collection
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="https://data.rijksmuseum.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--color-charcoal) transition-colors underline"
          >
            Rijksmuseum Open Data
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://surinametijdmachine.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--color-charcoal) transition-colors underline"
          >
            Tijdmachine
          </a>
        </div>
      </div>
    </footer>
  );
}
