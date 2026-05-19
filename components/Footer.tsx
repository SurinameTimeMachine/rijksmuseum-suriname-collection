import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-ink/65">
          <span className="font-medium text-ink/85">{t('projectName')}</span>
          <span className="text-ink/25" aria-hidden="true">
            •
          </span>
          <span>{t('year')}</span>
          <span className="text-ink/25" aria-hidden="true">
            •
          </span>
          <span>{t('projectLead')}</span>
          <span className="text-ink/25" aria-hidden="true">
            •
          </span>
          <span>{t('funder')}</span>
        </div>
      </div>
    </footer>
  );
}
