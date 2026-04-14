'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  MapPin,
  Save,
  Search,
  XCircle,
} from 'lucide-react';
import {
  useLocale,
  useTranslations,
} from 'next-intl';
import Link from 'next/link';

import streetAliases from '@/data/paramaribo-street-aliases.json';
import type {
  CollectionObject,
  GeoKeywordDetail,
  LocationEvidenceSource,
  LocationResolutionLevel,
} from '@/types/collection';

import ObjectImage from './ObjectImage';

interface LocationQaEditorProps {
  objects: CollectionObject[];
  surinameTerms: string[];
}

type StreetAliasEntry = {
  label: string;
  aliases: string[];
  wikidataQid: string | null;
};

type StreetSuggestionSource = 'title' | 'description' | 'commons';

type StreetNameSuggestion = {
  label: string;
  matchedVariant: string;
  source: StreetSuggestionSource;
  snippet: string;
  wikidataQid: string | null;
  score: number;
};

type WikidataLookup = {
  qid: string;
  url: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
};

type QueueFilter =
  | 'all'
  | 'needs-review'
  | 'exact-only'
  | 'outside-suriname'
  | 'unedited-only'
  | 'edited-only';
type QueueSort = 'review-priority' | 'title-asc' | 'title-desc' | 'objectnummer';
type QaViewMode = 'record' | 'spreadsheet';

const DEFAULT_AUTHOR = 'TvO';
const STREET_SUGGESTION_LIMIT = 3;
const STREET_SUGGESTION_SOURCE_WEIGHTS: Record<StreetSuggestionSource, number> = {
  title: 40,
  commons: 30,
  description: 20,
};
const PARAMARIBO_HINTS = ['paramaribo', 'suriname'];
const TEMP_STREET_ALIASES = streetAliases as StreetAliasEntry[];

const QUICK_FALLBACKS = {
  paramaribo: {
    label: 'Paramaribo (stad)',
    wikidataReference: 'Q3001',
    lat: 5.866666666,
    lng: -55.166666666,
    resolutionLevel: 'city' as const,
  },
  suriname: {
    label: 'Suriname (Zuid-Amerika)',
    wikidataReference: 'Q730',
    lat: 4,
    lng: -56,
    resolutionLevel: 'country' as const,
  },
};

function formatDetailSummary(detail: GeoKeywordDetail) {
  const parts = [detail.term];
  if (detail.broaderTerm) parts.push(detail.broaderTerm);
  if (detail.flags.includes('outside-suriname')) parts.push('outside-suriname');
  return parts.join(' • ');
}

function normalizeMatcherText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[-./_,:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCommonsText(url: string | null) {
  if (!url) return '';

  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function buildSuggestionSnippet(text: string, variant: string) {
  const match = text.match(new RegExp(escapeRegExp(variant), 'i'));
  if (!match || match.index === undefined) {
    return variant;
  }

  const start = Math.max(0, match.index - 40);
  const end = Math.min(text.length, match.index + match[0].length + 40);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function hasParamariboContext(obj: CollectionObject) {
  const values = [
    ...obj.geographicKeywords,
    ...obj.geoKeywordDetails.flatMap((detail) => [
      detail.term,
      detail.broaderTerm || '',
      detail.matchedLabel || '',
    ]),
  ];

  return values.some((value) => {
    const normalized = normalizeMatcherText(value);
    return PARAMARIBO_HINTS.some((hint) => normalized.includes(hint));
  });
}

function getStreetSearchSources(obj: CollectionObject) {
  return [
    {
      source: 'title' as const,
      text: obj.titles.filter(Boolean).join(' | '),
    },
    {
      source: 'description' as const,
      text: obj.description || '',
    },
    {
      source: 'commons' as const,
      text: extractCommonsText(obj.wikimediaUrl),
    },
  ].filter((entry) => entry.text.trim());
}

function getStreetSuggestions(obj: CollectionObject): StreetNameSuggestion[] {
  if (!hasParamariboContext(obj)) return [];

  const existingTerms = new Set(
    obj.geoKeywordDetails.flatMap((detail) => [
      normalizeMatcherText(detail.term),
      normalizeMatcherText(detail.matchedLabel || ''),
    ]),
  );

  const bestByLabel = new Map<string, StreetNameSuggestion>();
  const searchSources = getStreetSearchSources(obj).map((entry) => ({
    ...entry,
    normalized: normalizeMatcherText(entry.text),
  }));

  for (const entry of TEMP_STREET_ALIASES) {
    const normalizedLabel = normalizeMatcherText(entry.label);
    if (!normalizedLabel || existingTerms.has(normalizedLabel)) continue;

    const variants = [entry.label, ...entry.aliases].filter(Boolean);

    for (const variant of variants) {
      const normalizedVariant = normalizeMatcherText(variant);
      if (!normalizedVariant || normalizedVariant.length < 8) continue;

      const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedVariant)}(\\b|$)`, 'i');

      for (const sourceEntry of searchSources) {
        if (!pattern.test(sourceEntry.normalized)) continue;

        const candidate: StreetNameSuggestion = {
          label: entry.label,
          matchedVariant: variant,
          source: sourceEntry.source,
          snippet: buildSuggestionSnippet(sourceEntry.text, variant),
          wikidataQid: entry.wikidataQid,
          score:
            STREET_SUGGESTION_SOURCE_WEIGHTS[sourceEntry.source] +
            Math.min(normalizedVariant.length, 20) +
            (variant === entry.label ? 6 : 0),
        };

        const currentBest = bestByLabel.get(entry.label);
        if (!currentBest || candidate.score > currentBest.score) {
          bestByLabel.set(entry.label, candidate);
        }
      }
    }
  }

  return Array.from(bestByLabel.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, STREET_SUGGESTION_LIMIT);
}

function getSuggestionSourceLabel(
  t: ReturnType<typeof useTranslations<'locationQa'>>,
  source: StreetSuggestionSource,
) {
  if (source === 'title') return t('suggestionSourceTitle');
  if (source === 'commons') return t('suggestionSourceCommons');
  return t('suggestionSourceDescription');
}

function getEfBestSuggestion(
  detail: GeoKeywordDetail | null,
  suggestion: StreetNameSuggestion | undefined,
) {
  if (suggestion) {
    return `${suggestion.label} (${suggestion.source})`;
  }

  if (!detail) return '';
  if (detail.matchedLabel) return detail.matchedLabel;
  return detail.term;
}

function getEfQualityScore(
  detail: GeoKeywordDetail | null,
  suggestion: StreetNameSuggestion | undefined,
) {
  if (!detail && !suggestion) return 0;
  if (detail?.resolutionLevel === 'exact' && detail.wikidataUri && detail.lat !== null && detail.lng !== null) {
    return 95;
  }
  if (detail?.resolutionLevel === 'exact') return 85;
  if (suggestion && suggestion.score >= 55) return Math.min(82, suggestion.score + 10);
  if (detail?.resolutionLevel === 'broader') return 65;
  if (detail?.resolutionLevel === 'city') return 48;
  if (detail?.resolutionLevel === 'country') return 35;
  return 20;
}

function getEfSavePayload(
  obj: CollectionObject,
  detail: GeoKeywordDetail | null,
  topSuggestion: StreetNameSuggestion | undefined,
  reviewValue: string,
  reviewNote: string,
) {
  const normalized = reviewValue.trim();
  const acceptsSuggestion = normalized.toUpperCase() === 'Y';
  const fallbackLabel = getEfBestSuggestion(detail, topSuggestion) || detail?.term || '';
  const resolvedLocationLabel = acceptsSuggestion ? fallbackLabel : normalized;

  const wikidataReference = acceptsSuggestion
    ? topSuggestion?.wikidataQid || detail?.wikidataUri || ''
    : '';

  return {
    recordnummer: obj.recordnummer,
    objectnummer: obj.objectnummer,
    originalTerm: detail?.term || obj.geographicKeywords[0] || 'unknown',
    resolvedLocationLabel,
    wikidataReference,
    gazetteerReference: detail?.stmGazetteerUrl || '',
    lat: acceptsSuggestion ? (detail?.lat ?? '') : '',
    lng: acceptsSuggestion ? (detail?.lng ?? '') : '',
    resolutionLevel: detail?.resolutionLevel || 'exact',
    evidenceSource: topSuggestion && acceptsSuggestion ? 'beschrijving' : 'trefwoord',
    evidenceText: topSuggestion && acceptsSuggestion
      ? `${topSuggestion.source}: ${topSuggestion.snippet}`
      : '',
    author: DEFAULT_AUTHOR,
    remark: reviewNote.trim(),
  };
}

function SpreadsheetReviewRow({
  obj,
  detail,
  topSuggestion,
  qualityScore,
  t,
  locale,
}: {
  obj: CollectionObject;
  detail: GeoKeywordDetail | null;
  topSuggestion: StreetNameSuggestion | undefined;
  qualityScore: number;
  t: ReturnType<typeof useTranslations<'locationQa'>>;
  locale: string;
}) {
  const [reviewValue, setReviewValue] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [isSaving, startSaving] = useTransition();

  const bestSuggestion = getEfBestSuggestion(detail, topSuggestion);

  const handleSave = () => {
    if (!reviewValue.trim()) {
      setStatus('error');
      setMessage(t('efReviewFieldRequired'));
      return;
    }

    startSaving(async () => {
      const payload = getEfSavePayload(
        obj,
        detail,
        topSuggestion,
        reviewValue,
        reviewNote,
      );

      const response = await fetch('/api/location-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        setStatus('error');
        setMessage(body.error || t('saveError'));
        return;
      }

      setStatus('saved');
      setMessage(t('saved'));
    });
  };

  return (
    <tr className="border-b border-(--color-border) align-top">
      <td className="p-2">
        <div className="relative h-14 w-18 overflow-hidden border border-(--color-border) bg-(--color-cream-dark)">
          <ObjectImage
            src={obj.thumbnailUrl || obj.imageUrl}
            alt={obj.titles[0] || obj.objectnummer}
            fill
            className="object-contain"
            sizes="72px"
            isPublicDomain={obj.isPublicDomain}
          />
        </div>
      </td>
      <td className="p-2 min-w-56">
        <div className="font-medium text-(--color-charcoal)">{obj.titles[0] || obj.objectnummer}</div>
        <div className="mt-1 text-xs text-(--color-warm-gray)">{obj.objectnummer}</div>
        <Link
          href={`/${locale}/object/${encodeURIComponent(obj.objectnummer)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-(--color-rijks-red) hover:underline"
        >
          {t('openObject')}
          <ExternalLink size={11} />
        </Link>
      </td>
      <td className="p-2 min-w-80 text-xs text-(--color-charcoal-light)">
        <div className="line-clamp-3 whitespace-pre-wrap">{obj.description || t('noDescription')}</div>
      </td>
      <td className="p-2 min-w-56 text-xs">
        {detail?.term || obj.geographicKeywords[0] || '—'}
      </td>
      <td className="p-2 min-w-56 text-xs text-(--color-charcoal)">
        {bestSuggestion || '—'}
      </td>
      <td className="p-2 min-w-56">
        <input
          value={reviewValue}
          onChange={(event) => setReviewValue(event.target.value)}
          placeholder={t('efReviewFieldPlaceholder')}
          className="w-full border border-(--color-border) bg-white px-2 py-1.5 text-xs"
        />
      </td>
      <td className="p-2 min-w-56">
        <input
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder={t('efReviewNoteLabel')}
          className="w-full border border-(--color-border) bg-white px-2 py-1.5 text-xs"
        />
      </td>
      <td className="p-2 text-xs text-center font-medium">{qualityScore}</td>
      <td className="p-2 min-w-40">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs bg-(--color-charcoal) text-white hover:bg-(--color-charcoal-light) disabled:opacity-60"
        >
          <Save size={12} />
          {isSaving ? t('saveBusy') : t('saveAction')}
        </button>
        {status !== 'idle' && (
          <div
            className={`mt-1 text-[11px] ${
              status === 'saved' ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {message}
          </div>
        )}
      </td>
    </tr>
  );
}

function allFields(obj: CollectionObject) {
  return [
    ['recordnummer', String(obj.recordnummer)],
    ['objectnummer', obj.objectnummer],
    ['titles', obj.titles.join(' | ')],
    ['description', obj.description],
    ['creators', obj.creators.join(' | ')],
    ['dateStart', obj.dateStart],
    ['dateEnd', obj.dateEnd],
    ['objectTypes', obj.objectTypes.join(' | ')],
    ['materials', obj.materials.join(' | ')],
    ['classificationCode', obj.classificationCode],
    ['contentClassificationCodes', obj.contentClassificationCodes.join(' | ')],
    ['geographicKeywords', obj.geographicKeywords.join(' | ')],
    ['mainMotifGeneral', obj.mainMotifGeneral.join(' | ')],
    ['mainMotifSpecific', obj.mainMotifSpecific.join(' | ')],
    ['subjects', obj.subjects.join(' | ')],
    ['persons', obj.persons.join(' | ')],
    ['pidData', obj.pidData],
    ['pidWork', obj.pidWork],
  ].filter(([, value]) => value);
}

function getIssueDetails(obj: CollectionObject) {
  return obj.geoKeywordDetails.filter(
    (detail) =>
      detail.source === 'unresolved' ||
      detail.flags.includes('outside-suriname') ||
      detail.resolutionLevel === 'broader' ||
      detail.resolutionLevel === 'city' ||
      detail.resolutionLevel === 'country',
  );
}

function isReviewableDetail(detail: GeoKeywordDetail) {
  return detail.source !== 'edit' && detail.provenance === null;
}

function getPreferredDetail(
  obj: CollectionObject,
  preferredOriginalTerm?: string | null,
) {
  return (
    obj.geoKeywordDetails.find((detail) => detail.term === preferredOriginalTerm) ??
    obj.geoKeywordDetails.find(
      (detail) =>
        detail.source === 'unresolved' ||
        detail.flags.includes('outside-suriname') ||
        detail.resolutionLevel === 'broader' ||
        detail.resolutionLevel === 'city' ||
        detail.resolutionLevel === 'country',
    ) ??
    obj.geoKeywordDetails[0] ??
    null
  );
}

function ConfirmDetailButton({
  obj,
  detail,
  t,
  onConfirm,
  onMarkIncorrect,
}: {
  obj: CollectionObject;
  detail: GeoKeywordDetail;
  t: ReturnType<typeof useTranslations<'locationQa'>>;
  onConfirm?: (term: string) => void;
  onMarkIncorrect: (term: string) => void;
}) {
  const [isSaving, startSaving] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const confirmedDate = detail.provenance?.timestamp?.split('T')[0] ?? '';

  const handleRevert = () => {
    startSaving(async () => {
      await fetch('/api/location-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordnummer: obj.recordnummer,
          objectnummer: obj.objectnummer,
          originalTerm: detail.term,
          resolvedLocationLabel: detail.term,
          wikidataReference: '',
          gazetteerReference: '',
          lat: '',
          lng: '',
          resolutionLevel: detail.resolutionLevel || 'exact',
          evidenceSource: 'revert',
          evidenceText: '',
          author: DEFAULT_AUTHOR,
          remark: t('revertRemark'),
        }),
      });
      setConfirmed(false);
      onMarkIncorrect(detail.term);
    });
  };

  if (detail.source === 'edit' && detail.provenance) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 size={12} />
          {detail.provenance.author} · {confirmedDate}
        </span>
        <button
          onClick={handleRevert}
          disabled={isSaving}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-60"
        >
          <XCircle size={11} />
          {isSaving ? t('revertingLabel') : t('revertAction')}
        </button>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 size={12} />
          {t('confirmedLabel')}
        </span>
        <button
          onClick={() => onMarkIncorrect(detail.term)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
        >
          <XCircle size={11} />
          {t('incorrectAction')}
        </button>
      </div>
    );
  }

  const handleConfirm = () => {
    startSaving(async () => {
      await fetch('/api/location-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordnummer: obj.recordnummer,
          objectnummer: obj.objectnummer,
          originalTerm: detail.term,
          resolvedLocationLabel: detail.matchedLabel || detail.term,
          wikidataReference: detail.wikidataUri || '',
          gazetteerReference: detail.stmGazetteerUrl || '',
          lat: detail.lat,
          lng: detail.lng,
          resolutionLevel: detail.resolutionLevel || 'exact',
          evidenceSource: 'bevestigd',
          evidenceText: '',
          author: DEFAULT_AUTHOR,
          remark: '',
        }),
      });
      onConfirm?.(detail.term);
      setConfirmed(true);
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleConfirm}
        disabled={isSaving}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
      >
        <Check size={11} />
        {isSaving ? t('confirmingLabel') : t('confirmAction')}
      </button>
      <button
        onClick={() => onMarkIncorrect(detail.term)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
      >
        <XCircle size={11} />
        {t('incorrectAction')}
      </button>
    </div>
  );
}

function LocationEditForm({
  obj,
  t,
  streetSuggestions,
  activeOriginalTerm,
  onActiveOriginalTermChange,
}: {
  obj: CollectionObject;
  t: ReturnType<typeof useTranslations<'locationQa'>>;
  streetSuggestions: StreetNameSuggestion[];
  activeOriginalTerm?: string | null;
  onActiveOriginalTermChange?: (term: string) => void;
}) {
  const [isSaving, startSaving] = useTransition();
  const [isLookingUp, startLookup] = useTransition();

  // Prefer the first unresolved/flagged detail so the form focuses on the problem term
  const firstDetail = getPreferredDetail(obj, activeOriginalTerm);

  const [selectedOriginalTerm, setSelectedOriginalTerm] = useState(
    firstDetail?.term ?? '',
  );
  const [resolvedLocationLabel, setResolvedLocationLabel] = useState(
    firstDetail?.term ?? '',
  );
  const [wikidataReference, setWikidataReference] = useState(
    firstDetail?.wikidataUri || '',
  );
  const [gazetteerReference, setGazetteerReference] = useState(
    firstDetail?.stmGazetteerUrl || '',
  );
  const [lat, setLat] = useState(
    firstDetail?.lat !== null && firstDetail?.lat !== undefined
      ? String(firstDetail.lat)
      : '',
  );
  const [lng, setLng] = useState(
    firstDetail?.lng !== null && firstDetail?.lng !== undefined
      ? String(firstDetail.lng)
      : '',
  );
  const [resolutionLevel, setResolutionLevel] = useState<LocationResolutionLevel>(
    firstDetail?.resolutionLevel || 'exact',
  );
  const [evidenceSource, setEvidenceSource] = useState<LocationEvidenceSource>('trefwoord');
  const [evidenceText, setEvidenceText] = useState('');
  const [author, setAuthor] = useState(DEFAULT_AUTHOR);
  const [remark, setRemark] = useState('');
  const [lookup, setLookup] = useState<WikidataLookup | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);
  const [saveAsTermDefault, setSaveAsTermDefault] = useState(false);
  const [efReviewValue, setEfReviewValue] = useState('');
  const [efReviewNote, setEfReviewNote] = useState('');

  const selectedDetail =
    obj.geoKeywordDetails.find((detail) => detail.term === selectedOriginalTerm) ||
    firstDetail;
  const topStreetSuggestion = streetSuggestions[0];
  const efBestSuggestion = getEfBestSuggestion(selectedDetail, topStreetSuggestion);
  const efQualityScore = getEfQualityScore(selectedDetail, topStreetSuggestion);

  useEffect(() => {
    if (selectedOriginalTerm) {
      onActiveOriginalTermChange?.(selectedOriginalTerm);
    }
  }, [onActiveOriginalTermChange, selectedOriginalTerm]);

  const syncFromDetail = (detail: GeoKeywordDetail) => {
    setSelectedOriginalTerm(detail.term);
    setResolvedLocationLabel(detail.term);
    setWikidataReference(detail.wikidataUri || '');
    setGazetteerReference(detail.stmGazetteerUrl || '');
    setLat(detail.lat !== null ? String(detail.lat) : '');
    setLng(detail.lng !== null ? String(detail.lng) : '');
    setResolutionLevel(detail.resolutionLevel || 'exact');
    setEvidenceSource('trefwoord');
    setEvidenceText('');
    setRemark('');
    setLookup(null);
    setStatusMessage(null);
    setStatusType(null);
    setSaveAsTermDefault(false);
    setEfReviewValue('');
    setEfReviewNote('');
  };

  const applyStreetSuggestion = (suggestion: StreetNameSuggestion) => {
    setResolvedLocationLabel(suggestion.label);
    setWikidataReference(suggestion.wikidataQid || '');
    setGazetteerReference('');
    setLat('');
    setLng('');
    setResolutionLevel('exact');
    setEvidenceSource('beschrijving');
    setEvidenceText(
      `${getSuggestionSourceLabel(t, suggestion.source)}: ${suggestion.snippet}`,
    );
    setRemark('');
    setLookup(null);
    setStatusMessage(null);
    setStatusType(null);
    setSaveAsTermDefault(false);
    setEfReviewValue('');
    setEfReviewNote('');
  };

  const handleLookup = () => {
    if (!wikidataReference.trim()) return;

    startLookup(async () => {
      setStatusMessage(null);
      setStatusType(null);
      const response = await fetch(
        `/api/wikidata-entity?q=${encodeURIComponent(wikidataReference.trim())}`,
      );
      const payload = await response.json();

      if (!response.ok) {
        setLookup(null);
        setStatusType('error');
        setStatusMessage(payload.error || t('lookupError'));
        return;
      }

      setLookup(payload);
      if (payload.label) setResolvedLocationLabel(payload.label);
      if (payload.url) setWikidataReference(payload.url);
      if (payload.lat !== null) setLat(String(payload.lat));
      if (payload.lng !== null) setLng(String(payload.lng));
    });
  };

  const applyFallback = (fallback: keyof typeof QUICK_FALLBACKS) => {
    const option = QUICK_FALLBACKS[fallback];
    setResolvedLocationLabel(option.label);
    setWikidataReference(option.wikidataReference);
    setLat(String(option.lat));
    setLng(String(option.lng));
    setResolutionLevel(option.resolutionLevel);
    setLookup(null);
  };

  const applyBroaderFallback = () => {
    if (!selectedDetail?.broaderTerm) return;
    setResolvedLocationLabel(selectedDetail.broaderTerm);
    setResolutionLevel(
      selectedDetail.broaderTerm.toLowerCase().includes('paramaribo')
        ? 'city'
        : selectedDetail.broaderTerm.toLowerCase().includes('suriname')
          ? 'country'
          : 'broader',
    );
  };

  const handleSave = () => {
    const normalizedEfInput = efReviewValue.trim();
    const finalResolvedLocationLabel = normalizedEfInput
      ? normalizedEfInput.toUpperCase() === 'Y'
        ? efBestSuggestion || resolvedLocationLabel
        : normalizedEfInput
      : resolvedLocationLabel;
    const finalRemark = [remark, efReviewNote.trim()]
      .filter(Boolean)
      .join(' | ');

    if (!selectedOriginalTerm || !finalResolvedLocationLabel || !author) {
      setStatusType('error');
      setStatusMessage(t('saveValidation'));
      return;
    }

    startSaving(async () => {
      const response = await fetch('/api/location-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordnummer: obj.recordnummer,
          objectnummer: obj.objectnummer,
          originalTerm: selectedOriginalTerm,
          resolvedLocationLabel: finalResolvedLocationLabel,
          wikidataReference,
          gazetteerReference,
          lat,
          lng,
          resolutionLevel,
          evidenceSource,
          evidenceText,
          author,
          remark: finalRemark,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setStatusType('error');
        setStatusMessage(payload.error || t('saveError'));
        return;
      }

      if (saveAsTermDefault) {
        await fetch('/api/term-defaults', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            term: selectedOriginalTerm,
            resolvedLocationLabel: finalResolvedLocationLabel,
            wikidataReference,
            gazetteerReference,
            lat,
            lng,
            resolutionLevel,
            author,
          }),
        });
      }

      setStatusType('success');
      setStatusMessage(
        payload.flags?.includes('outside-suriname')
          ? t('savedWithFlag')
          : saveAsTermDefault
            ? t('savedWithTermDefault')
            : t('saved'),
      );
    });
  };

  return (
    <section className="border border-(--color-border) bg-(--color-card) p-5 h-fit sticky top-6 space-y-5">
      <div>
        <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
          {t('editorTitle')}
        </div>
        <p className="mt-2 text-xs text-(--color-warm-gray)">{t('editorHelp')}</p>
        <div className="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <div className="font-semibold uppercase tracking-wider">{t('editorModeLabel')}</div>
          <div className="mt-1">{t('editorModeHelp')}</div>
          {selectedOriginalTerm && (
            <div className="mt-2 inline-flex items-center gap-2 border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-900">
              <span>{t('activeTermLabel')}</span>
              <span>{selectedOriginalTerm}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border border-emerald-200 bg-emerald-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
          {t('efTitle')}
        </div>
        <p className="text-xs text-emerald-900">{t('efHelp')}</p>

        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 items-start">
          <div className="relative h-16 w-20 overflow-hidden border border-emerald-300 bg-white">
            <ObjectImage
              src={obj.thumbnailUrl || obj.imageUrl}
              alt={obj.titles[0] || obj.objectnummer}
              fill
              className="object-contain"
              sizes="80px"
              isPublicDomain={obj.isPublicDomain}
            />
          </div>
          <div className="min-w-0 text-xs text-emerald-900">
            <div className="font-medium truncate">{obj.titles[0] || obj.objectnummer}</div>
            <div className="mt-1 line-clamp-2">{obj.description || t('noDescription')}</div>
          </div>
        </div>

        <div className="text-xs">
          <span className="font-semibold text-emerald-900">{t('efGeoKeywordLabel')}: </span>
          <span className="text-(--color-charcoal)">{selectedOriginalTerm || '—'}</span>
        </div>

        <div className="text-xs">
          <span className="font-semibold text-emerald-900">{t('efBestSuggestionLabel')}: </span>
          <span className="text-(--color-charcoal)">{efBestSuggestion || '—'}</span>
        </div>

        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-900 mb-2">
            {t('efReviewFieldLabel')}
          </span>
          <input
            value={efReviewValue}
            onChange={(event) => setEfReviewValue(event.target.value)}
            placeholder={t('efReviewFieldPlaceholder')}
            className="w-full border border-emerald-300 bg-white px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-emerald-900 mb-2">
            {t('efReviewNoteLabel')}
          </span>
          <textarea
            value={efReviewNote}
            onChange={(event) => setEfReviewNote(event.target.value)}
            rows={2}
            className="w-full border border-emerald-300 bg-white px-3 py-2"
          />
        </label>

        <div className="text-xs text-emerald-900">
          <span className="font-semibold">{t('efQualityScoreLabel')}: </span>
          {efQualityScore}
        </div>
      </div>

      <details className="border border-(--color-border) bg-white p-3" open={false}>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray)">
          {t('efAdvancedSectionLabel')}
        </summary>
        <div className="mt-3 space-y-5">

      {streetSuggestions.length > 0 && (
        <div className="space-y-3 border border-amber-200 bg-amber-50 p-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-900">
              {t('streetSuggestionsTitle')}
            </div>
            <p className="mt-1 text-xs text-amber-900">{t('streetSuggestionsHelp')}</p>
          </div>
          <div className="grid gap-2">
            {streetSuggestions.map((suggestion) => (
              <div key={`${suggestion.label}-${suggestion.source}`} className="border border-amber-300 bg-white p-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-(--color-charcoal)">{suggestion.label}</div>
                    <div className="mt-1 text-(--color-warm-gray)">
                      {getSuggestionSourceLabel(t, suggestion.source)} · {suggestion.matchedVariant}
                    </div>
                  </div>
                  <button
                    onClick={() => applyStreetSuggestion(suggestion)}
                    className="shrink-0 px-2 py-1 border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  >
                    {t('suggestionUseAction')}
                  </button>
                </div>
                <div className="mt-2 text-(--color-charcoal-light)">{suggestion.snippet}</div>
                {suggestion.wikidataQid && (
                  <div className="mt-2 text-(--color-warm-gray)">Wikidata: {suggestion.wikidataQid}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('originalTermLabel')}
        </span>
        <select
          value={selectedOriginalTerm}
          onChange={(event) => {
            const nextDetail =
              obj.geoKeywordDetails.find((detail) => detail.term === event.target.value) ||
              firstDetail;
            if (nextDetail) syncFromDetail(nextDetail);
          }}
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        >
          {obj.geoKeywordDetails.map((detail) => (
            <option key={`${obj.objectnummer}-${detail.term}`} value={detail.term}>
              {detail.term}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('resolvedLabel')}
        </span>
        <input
          value={resolvedLocationLabel}
          onChange={(event) => setResolvedLocationLabel(event.target.value)}
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
            {t('wikidataLabel')}
          </span>
          <input
            value={wikidataReference}
            onChange={(event) => setWikidataReference(event.target.value)}
            placeholder="Q3001 or https://www.wikidata.org/entity/Q3001"
            className="w-full border border-(--color-border) bg-white px-3 py-2"
          />
        </label>
        <button
          onClick={handleLookup}
          disabled={isLookingUp}
          className="px-3 py-2 border border-(--color-border) text-sm hover:bg-(--color-cream-dark) disabled:opacity-60"
        >
          {isLookingUp ? t('lookupBusy') : t('lookupAction')}
        </button>
      </div>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('gazetteerLabel')}
        </span>
        <input
          value={gazetteerReference}
          onChange={(event) => setGazetteerReference(event.target.value)}
          placeholder="https://www.surinametimemachine.com/..."
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        />
      </label>

      {lookup && (
        <div className="border border-(--color-border) bg-(--color-cream-dark) p-3 text-sm">
          <div className="font-medium text-(--color-charcoal)">{lookup.label || lookup.qid}</div>
          <div className="mt-1 text-xs text-(--color-warm-gray)">
            {lookup.qid} · {lookup.lat ?? '—'}, {lookup.lng ?? '—'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
            {t('latitudeLabel')}
          </span>
          <input
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            className="w-full border border-(--color-border) bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
            {t('longitudeLabel')}
          </span>
          <input
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            className="w-full border border-(--color-border) bg-white px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('resolutionLevelLabel')}
        </span>
        <select
          value={resolutionLevel}
          onChange={(event) =>
            setResolutionLevel(event.target.value as LocationResolutionLevel)
          }
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        >
          <option value="exact">exact</option>
          <option value="broader">broader</option>
          <option value="city">city</option>
          <option value="country">country</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('evidenceSourceLabel')}
        </span>
        <select
          value={evidenceSource}
          onChange={(event) =>
            setEvidenceSource(event.target.value as LocationEvidenceSource)
          }
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        >
          <option value="trefwoord">trefwoord</option>
          <option value="beschrijving">beschrijving</option>
          <option value="both">both</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('evidenceTextLabel')}
        </span>
        <textarea
          value={evidenceText}
          onChange={(event) => setEvidenceText(event.target.value)}
          rows={4}
          className="w-full border border-(--color-border) bg-white px-3 py-2"
          placeholder={t('evidenceTextPlaceholder')}
        />
      </label>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray)">
          {t('fallbackActions')}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={applyBroaderFallback} className="px-3 py-2 text-xs border border-(--color-border) hover:bg-(--color-cream-dark)">
            {t('fallbackBroader')}
          </button>
          <button onClick={() => applyFallback('paramaribo')} className="px-3 py-2 text-xs border border-(--color-border) hover:bg-(--color-cream-dark)">
            {t('fallbackParamaribo')}
          </button>
          <button onClick={() => applyFallback('suriname')} className="px-3 py-2 text-xs border border-(--color-border) hover:bg-(--color-cream-dark)">
            {t('fallbackSuriname')}
          </button>
        </div>
      </div>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('authorLabel')}
        </span>
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
          {t('remarkLabel')}
        </span>
        <textarea
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          rows={3}
          className="w-full border border-(--color-border) bg-white px-3 py-2"
        />
      </label>

      {statusMessage && (
        <div
          className={`flex items-start gap-2 border px-3 py-2 text-sm ${
            statusType === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {statusType === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{statusMessage}</span>
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-(--color-charcoal-light) cursor-pointer select-none">
        <input
          type="checkbox"
          checked={saveAsTermDefault}
          onChange={(event) => setSaveAsTermDefault(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-(--color-charcoal)"
        />
        <span>{t('saveAsTermDefaultLabel')}</span>
      </label>
        </div>
      </details>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-(--color-charcoal) text-white hover:bg-(--color-charcoal-light) disabled:opacity-60"
      >
        <Save size={15} />
        {isSaving ? t('saveBusy') : t('saveAction')}
      </button>

      <div className="text-xs text-(--color-warm-gray) border-t border-(--color-border) pt-4">
        <div className="flex items-start gap-2">
          <FileText size={14} className="mt-0.5" />
          <span>{t('localWriteNote')}</span>
        </div>
      </div>
    </section>
  );
}

export default function LocationQaEditor({
  objects,
  surinameTerms,
}: LocationQaEditorProps) {
  const t = useTranslations('locationQa');
  const locale = useLocale();
  const [showOnlySuriname, setShowOnlySuriname] = useState(true);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [queueSort, setQueueSort] = useState<QueueSort>('review-priority');
  const [qaViewMode, setQaViewMode] = useState<QaViewMode>('record');

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [focusedOriginalTerm, setFocusedOriginalTerm] = useState<string | null>(null);
  const [selectedObjectnummer, setSelectedObjectnummer] = useState(
    objects[0]?.objectnummer ?? '',
  );

  const surinameTermSet = useMemo(
    () => new Set(surinameTerms.map((term) => term.toLowerCase())),
    [surinameTerms],
  );

  const filteredObjects = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();

    const hasSurinameLocation = (obj: CollectionObject) => {
      if (!showOnlySuriname) return true;

      const candidates = new Set<string>();

      for (const keyword of obj.geographicKeywords) {
        candidates.add(keyword.toLowerCase());
      }
      for (const detail of obj.geoKeywordDetails) {
        candidates.add(detail.term.toLowerCase());
        if (detail.matchedLabel) {
          candidates.add(detail.matchedLabel.toLowerCase());
        }
      }

      for (const candidate of candidates) {
        if (surinameTermSet.has(candidate)) {
          return true;
        }
      }

      return false;
    };

    return objects.filter((obj) => {
      if (!hasSurinameLocation(obj)) return false;

      const issueDetails = getIssueDetails(obj);
      const hasIssues = issueDetails.length > 0;
      const hasOutsideSuriname = issueDetails.some((detail) =>
        detail.flags.includes('outside-suriname'),
      );
      const hasSavedEdits = obj.geoKeywordDetails.some(
        (detail) => detail.source === 'edit' || detail.provenance !== null,
      );

      if (queueFilter === 'needs-review' && !hasIssues) return false;
      if (queueFilter === 'exact-only' && hasIssues) return false;
      if (queueFilter === 'outside-suriname' && !hasOutsideSuriname) return false;
      if (queueFilter === 'unedited-only' && hasSavedEdits) return false;
      if (queueFilter === 'edited-only' && !hasSavedEdits) return false;

      if (!normalized) return true;

      const haystack = [
        obj.objectnummer,
        obj.titles.join(' '),
        obj.description,
        obj.geographicKeywords.join(' '),
        obj.geoKeywordDetails.map((detail) => detail.term).join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    }).sort((a, b) => {
      if (queueSort === 'title-asc') {
        return (a.titles[0] || a.objectnummer).localeCompare(
          b.titles[0] || b.objectnummer,
        );
      }
      if (queueSort === 'title-desc') {
        return (b.titles[0] || b.objectnummer).localeCompare(
          a.titles[0] || a.objectnummer,
        );
      }
      if (queueSort === 'objectnummer') {
        return a.objectnummer.localeCompare(b.objectnummer);
      }

      const aIssues = getIssueDetails(a).length;
      const bIssues = getIssueDetails(b).length;
      if (aIssues !== bIssues) return bIssues - aIssues;

      return (a.titles[0] || a.objectnummer).localeCompare(
        b.titles[0] || b.objectnummer,
      );
    });
  }, [deferredQuery, objects, queueFilter, queueSort, showOnlySuriname, surinameTermSet]);

  const selectedObject =
    filteredObjects.find((obj) => obj.objectnummer === selectedObjectnummer) ||
    filteredObjects[0] ||
    (showOnlySuriname
      ? null
      : objects.find((obj) => obj.objectnummer === selectedObjectnummer) ||
        objects[0] ||
        null);

  const selectedIndex = filteredObjects.findIndex(
    (obj) => obj.objectnummer === selectedObject?.objectnummer,
  );
  const hasPrevious = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filteredObjects.length - 1;
  const activeDetail = selectedObject
    ? getPreferredDetail(selectedObject, focusedOriginalTerm)
    : null;
  const activeOriginalTerm = activeDetail?.term ?? null;
  const streetSuggestions = useMemo(
    () => (selectedObject ? getStreetSuggestions(selectedObject) : []),
    [selectedObject],
  );

  const spreadsheetRows = useMemo(() => {
    return filteredObjects.map((obj) => {
      const detail = getPreferredDetail(obj, null);
      const topSuggestion = getStreetSuggestions(obj)[0];
      const qualityScore = getEfQualityScore(detail, topSuggestion);

      return {
        obj,
        detail,
        topSuggestion,
        qualityScore,
      };
    });
  }, [filteredObjects]);

  const goToQueueIndex = (index: number) => {
    const next = filteredObjects[index];
    if (!next) return;
    setSelectedObjectnummer(next.objectnummer);
    setFocusedOriginalTerm(null);
  };

  const goToNextReviewTarget = (term: string) => {
    const currentDetailIndex = selectedObject.geoKeywordDetails.findIndex(
      (detail) => detail.term === term,
    );

    if (currentDetailIndex >= 0) {
      const nextDetail = selectedObject.geoKeywordDetails
        .slice(currentDetailIndex + 1)
        .find(isReviewableDetail);

      if (nextDetail) {
        setFocusedOriginalTerm(nextDetail.term);
        return;
      }
    }

    const nextObject = filteredObjects[selectedIndex + 1];
    if (!nextObject) {
      setFocusedOriginalTerm(term);
      return;
    }

    const nextDetail = getPreferredDetail(nextObject, null);
    setSelectedObjectnummer(nextObject.objectnummer);
    setFocusedOriginalTerm(nextDetail?.term ?? null);
  };

  if (!selectedObject) {
    return <div className="py-12 text-center text-(--color-warm-gray)">{t('noQueueResults')}</div>;
  }

  return (
    <div className={
      qaViewMode === 'spreadsheet'
        ? 'grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)] gap-6'
        : 'grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)_24rem] gap-6'
    }>
      <section className="border border-(--color-border) bg-(--color-card)">
        <div className="p-4 border-b border-(--color-border)">
          <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
            {t('queueTitle')} ({filteredObjects.length})
          </div>
          <div className="mt-3 inline-flex border border-(--color-border) bg-white">
            <button
              onClick={() => setQaViewMode('record')}
              className={`px-3 py-1.5 text-xs ${qaViewMode === 'record' ? 'bg-(--color-cream-dark)' : 'hover:bg-(--color-cream-dark)'}`}
            >
              {t('qaViewRecord')}
            </button>
            <button
              onClick={() => setQaViewMode('spreadsheet')}
              className={`px-3 py-1.5 text-xs border-l border-(--color-border) ${qaViewMode === 'spreadsheet' ? 'bg-(--color-cream-dark)' : 'hover:bg-(--color-cream-dark)'}`}
            >
              {t('qaViewSpreadsheet')}
            </button>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-(--color-charcoal-light)">
            <input
              type="checkbox"
              checked={showOnlySuriname}
              onChange={(event) => setShowOnlySuriname(event.target.checked)}
              className="h-3.5 w-3.5 accent-(--color-charcoal)"
            />
            {t('filterLikelySuriname')}
          </label>
          <div className="mt-3 grid gap-3">
            <label className="block text-xs">
              <span className="block mb-1 font-semibold uppercase tracking-wider text-(--color-warm-gray)">
                {t('queueFilterLabel')}
              </span>
              <select
                value={queueFilter}
                onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
                className="w-full border border-(--color-border) bg-white px-3 py-2 text-sm"
              >
                <option value="all">{t('queueFilterAll')}</option>
                <option value="needs-review">{t('queueFilterNeedsReview')}</option>
                <option value="exact-only">{t('queueFilterExactOnly')}</option>
                <option value="outside-suriname">{t('queueFilterOutsideSuriname')}</option>
                <option value="unedited-only">{t('queueFilterUneditedOnly')}</option>
                <option value="edited-only">{t('queueFilterEditedOnly')}</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="block mb-1 font-semibold uppercase tracking-wider text-(--color-warm-gray)">
                {t('queueSortLabel')}
              </span>
              <select
                value={queueSort}
                onChange={(event) => setQueueSort(event.target.value as QueueSort)}
                className="w-full border border-(--color-border) bg-white px-3 py-2 text-sm"
              >
                <option value="review-priority">{t('queueSortReviewPriority')}</option>
                <option value="title-asc">{t('queueSortTitleAsc')}</option>
                <option value="title-desc">{t('queueSortTitleDesc')}</option>
                <option value="objectnummer">{t('queueSortObjectNumber')}</option>
              </select>
            </label>
          </div>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-warm-gray-light)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-8 pr-3 py-2 border border-(--color-border) bg-white text-sm"
            />
          </div>
        </div>
        <div className="max-h-[72vh] overflow-y-auto">
          {filteredObjects.map((obj) => {
            const flagged = getIssueDetails(obj);

            return (
              <button
                key={obj.objectnummer}
                onClick={() => {
                  setSelectedObjectnummer(obj.objectnummer);
                  setFocusedOriginalTerm(null);
                }}
                className={`w-full text-left p-4 border-b border-(--color-border) transition-colors ${
                  obj.objectnummer === selectedObjectnummer
                    ? 'bg-(--color-cream-dark)'
                    : 'hover:bg-(--color-cream-dark)'
                }`}
              >
                <div className="text-xs text-(--color-warm-gray-light) font-mono">
                  {obj.objectnummer}
                </div>
                <div className="mt-1 font-serif text-sm text-(--color-charcoal)">
                  {obj.titles[0] || obj.objectnummer}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {flagged.slice(0, 3).map((detail) => (
                    <span
                      key={`${obj.objectnummer}-${detail.term}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-amber-300 bg-amber-50 text-amber-800"
                    >
                      <AlertTriangle size={10} />
                      {detail.term}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {qaViewMode === 'spreadsheet' ? (
        <section className="border border-(--color-border) bg-(--color-card)">
          <div className="p-4 border-b border-(--color-border)">
            <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
              {t('qaSpreadsheetTitle')} ({spreadsheetRows.length})
            </div>
            <p className="mt-1 text-xs text-(--color-warm-gray)">{t('qaSpreadsheetHelp')}</p>
          </div>
          <div className="overflow-auto max-h-[78vh]">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="sticky top-0 bg-(--color-cream-dark) border-b border-(--color-border)">
                <tr className="text-left text-xs uppercase tracking-wider text-(--color-warm-gray)">
                  <th className="p-2">{t('qaSpreadsheetImage')}</th>
                  <th className="p-2">{t('qaSpreadsheetTitleCol')}</th>
                  <th className="p-2">{t('qaSpreadsheetDescription')}</th>
                  <th className="p-2">{t('qaSpreadsheetGeoKeyword')}</th>
                  <th className="p-2">{t('qaSpreadsheetBestSuggestion')}</th>
                  <th className="p-2">{t('qaSpreadsheetReview')}</th>
                  <th className="p-2">{t('qaSpreadsheetNote')}</th>
                  <th className="p-2">{t('qaSpreadsheetQuality')}</th>
                  <th className="p-2">{t('qaSpreadsheetSave')}</th>
                </tr>
              </thead>
              <tbody>
                {spreadsheetRows.map((row) => (
                  <SpreadsheetReviewRow
                    key={`${row.obj.objectnummer}:${row.detail?.term || 'none'}`}
                    obj={row.obj}
                    detail={row.detail}
                    topSuggestion={row.topSuggestion}
                    qualityScore={row.qualityScore}
                    t={t}
                    locale={locale}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
      <section className="space-y-6">
        <div className="border border-(--color-border) bg-(--color-card)">
          <div className="grid grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] gap-6 p-5">
            <div>
              <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark) border border-(--color-border)">
                <ObjectImage
                  src={selectedObject.thumbnailUrl || selectedObject.imageUrl}
                  alt={selectedObject.titles[0] || selectedObject.objectnummer}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 18rem"
                  isPublicDomain={selectedObject.isPublicDomain}
                />
              </div>
              <Link
                href={`/${locale}/object/${encodeURIComponent(selectedObject.objectnummer)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-(--color-rijks-red) hover:underline"
              >
                {t('openObject')}
                <ExternalLink size={11} />
              </Link>
            </div>

            <div className="min-w-0">
              <div className="font-serif text-xl md:text-2xl leading-tight break-words hyphens-auto">
                {selectedObject.titles[0] || selectedObject.objectnummer}
              </div>
              <div className="mt-2 text-xs font-mono text-(--color-warm-gray-light)">
                {selectedObject.objectnummer} · {selectedObject.recordnummer}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => goToQueueIndex(selectedIndex - 1)}
                  disabled={!hasPrevious}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-(--color-border) bg-white hover:bg-(--color-cream-dark) disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={12} />
                  {t('previousAction')}
                </button>
                <button
                  onClick={() => goToQueueIndex(selectedIndex + 1)}
                  disabled={!hasNext}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-(--color-border) bg-white hover:bg-(--color-cream-dark) disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('nextAction')}
                  <ChevronRight size={12} />
                </button>
                <span className="text-xs text-(--color-warm-gray)">
                  {t('queuePosition', {
                    current: Math.max(1, selectedIndex + 1),
                    total: Math.max(1, filteredObjects.length),
                  })}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                  {t('descriptionLabel')}
                </div>
                <div className="p-4 border border-(--color-border) bg-(--color-cream-dark) text-sm leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {selectedObject.description || t('noDescription')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-(--color-border) bg-(--color-card) p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
                {t('locationContext')}
              </div>
              <p className="mt-2 text-xs text-(--color-warm-gray)">{t('contextHelp')}</p>
            </div>
            {activeOriginalTerm && (
              <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold uppercase tracking-wider">{t('activeTermLabel')}</div>
                <div className="mt-1 font-medium">{activeOriginalTerm}</div>
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {selectedObject.geoKeywordDetails.map((detail) => (
              <div
                key={`${selectedObject.objectnummer}-${detail.term}-${detail.source}`}
                className={`border p-3 bg-white ${
                  detail.term === activeOriginalTerm
                    ? 'border-blue-300 ring-1 ring-blue-200'
                    : 'border-(--color-border)'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-(--color-charcoal)">{detail.term}</span>
                  {detail.term === activeOriginalTerm && (
                    <span className="text-xs px-2 py-0.5 border border-blue-300 bg-blue-50 text-blue-800">
                      {t('activeTermBadge')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 border ${
                    detail.source === 'edit'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : detail.source === 'term-default'
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-(--color-border) text-(--color-warm-gray)'
                  }`}>
                    {detail.source}
                  </span>
                  {detail.resolutionLevel && (
                    <span className="text-xs px-2 py-0.5 border border-(--color-border)">
                      {detail.resolutionLevel}
                    </span>
                  )}
                  {detail.flags.includes('outside-suriname') && (
                    <span className="text-xs px-2 py-0.5 border border-amber-300 bg-amber-50 text-amber-800">
                      {t('flagOutsideSuriname')}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-(--color-warm-gray)">{formatDetailSummary(detail)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {detail.wikidataUri && (
                    <a
                      href={detail.wikidataUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-(--color-rijks-red) hover:underline"
                    >
                      {t('wikidataLink')}
                      <ExternalLink size={11} />
                    </a>
                  )}
                  {detail.stmGazetteerUrl && (
                    <a
                      href={detail.stmGazetteerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-(--color-rijks-red) hover:underline"
                    >
                      {t('gazetteerLink')}
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <ConfirmDetailButton
                    obj={selectedObject}
                    detail={detail}
                    t={t}
                    onConfirm={goToNextReviewTarget}
                    onMarkIncorrect={(term) => {
                      setSelectedObjectnummer(selectedObject.objectnummer);
                      setFocusedOriginalTerm(term);
                    }}
                  />
                </div>
                {(detail.lat !== null || detail.lng !== null) && (
                  <div className="mt-2 text-xs text-(--color-charcoal-light)">
                    <MapPin size={12} className="inline mr-1" />
                    {detail.lat ?? '—'}, {detail.lng ?? '—'}
                  </div>
                )}
                {detail.provenance && (
                  <div className="mt-2 text-xs text-(--color-warm-gray)">
                    {detail.provenance.author} · {detail.provenance.timestamp}
                    {detail.provenance.remark ? ` · ${detail.provenance.remark}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border border-(--color-border) bg-(--color-card) p-5">
          <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
            {t('allFieldsTitle')}
          </div>
          <div className="mt-4 grid gap-3 max-h-[34rem] overflow-y-auto">
            {allFields(selectedObject).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[12rem_minmax(0,1fr)] gap-3 border-b border-(--color-border) pb-2 text-sm">
                <div className="text-(--color-warm-gray)">{label}</div>
                <div className="break-words whitespace-pre-wrap text-(--color-charcoal-light)">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {qaViewMode === 'record' && (
        <LocationEditForm
          key={`${selectedObject.objectnummer}:${activeOriginalTerm ?? ''}`}
          obj={selectedObject}
          t={t}
          streetSuggestions={streetSuggestions}
          activeOriginalTerm={activeOriginalTerm}
          onActiveOriginalTermChange={setFocusedOriginalTerm}
        />
      )}
    </div>
  );
}