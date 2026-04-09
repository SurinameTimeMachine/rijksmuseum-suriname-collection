'use client';

import {
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
} from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  MapPin,
  Save,
  Search,
} from 'lucide-react';
import {
  useLocale,
  useTranslations,
} from 'next-intl';
import Link from 'next/link';

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

const DEFAULT_AUTHOR = 'TvO';

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

function LocationEditForm({
  obj,
  t,
}: {
  obj: CollectionObject;
  t: ReturnType<typeof useTranslations<'locationQa'>>;
}) {
  const [isSaving, startSaving] = useTransition();
  const [isLookingUp, startLookup] = useTransition();
  const firstDetail = obj.geoKeywordDetails[0] ?? null;

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

  const selectedDetail =
    obj.geoKeywordDetails.find((detail) => detail.term === selectedOriginalTerm) ||
    firstDetail;

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
    if (!selectedOriginalTerm || !resolvedLocationLabel || !author) {
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
          resolvedLocationLabel,
          wikidataReference,
          gazetteerReference,
          lat,
          lng,
          resolutionLevel,
          evidenceSource,
          evidenceText,
          author,
          remark,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setStatusType('error');
        setStatusMessage(payload.error || t('saveError'));
        return;
      }

      setStatusType('success');
      setStatusMessage(
        payload.flags?.includes('outside-suriname')
          ? t('savedWithFlag')
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
      </div>

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

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
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

  if (!selectedObject) {
    return <div className="py-12 text-center text-(--color-warm-gray)">{t('noQueueResults')}</div>;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)_24rem] gap-6">
      <section className="border border-(--color-border) bg-(--color-card)">
        <div className="p-4 border-b border-(--color-border)">
          <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
            {t('queueTitle')} ({filteredObjects.length})
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
                onClick={() => setSelectedObjectnummer(obj.objectnummer)}
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
          <div className="text-sm font-semibold uppercase tracking-wider text-(--color-warm-gray)">
            {t('locationContext')}
          </div>
          <div className="mt-4 grid gap-3">
            {selectedObject.geoKeywordDetails.map((detail) => (
              <div key={`${selectedObject.objectnummer}-${detail.term}-${detail.source}`} className="border border-(--color-border) p-3 bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-(--color-charcoal)">{detail.term}</span>
                  <span className="text-xs text-(--color-warm-gray)">{detail.source}</span>
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

      <LocationEditForm key={selectedObject.objectnummer} obj={selectedObject} t={t} />
    </div>
  );
}