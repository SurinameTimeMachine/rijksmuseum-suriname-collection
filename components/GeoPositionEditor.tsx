'use client';

/**
 * GeoPositionEditor — the multi-step editor for placing collection objects on the map.
 *
 * 3-step Gouda Time Machine-style workflow:
 * 1. Triage: Is this an outdoor scene with a recognisable location?
 * 2. Location: Confirm/sort geographic keywords, select location type
 * 3. Camera: Place camera + viewing cone on the map
 *
 * Works in two modes:
 * - Queue mode: cycles through unpositioned objects
 * - Single mode: positions a specific object (via ?object= param)
 */

import { geoCoordinates } from '@/data/geo-coordinates';
import type { CollectionObject } from '@/types/collection';
import type { ContributionPayload, GeoSession } from '@/types/geo-position';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Crosshair,
  Eye,
  Flag,
  Github,
  LogOut,
  MapPin,
  Move,
  Ruler,
  SkipForward,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import ObjectImage from './ObjectImage';

/* ---- SSR-safe mount check ---- */
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/* ---- Types ---- */
type Step = 'triage' | 'location' | 'camera' | 'success';
type LocationType = 'street' | 'building' | 'landscape' | 'waterway' | 'other';

interface GeoPositionEditorProps {
  /** Objects to position (queue of candidates) */
  objects: CollectionObject[];
  /** If set, start with this specific object instead of the first in queue */
  initialObjectNummer?: string;
  /** Total number of objects in the collection (for progress display) */
  totalObjects: number;
  /** Number already positioned */
  positionedCount: number;
}

/* ---- Main component ---- */
export default function GeoPositionEditor({
  objects,
  initialObjectNummer,
  totalObjects,
  positionedCount,
}: GeoPositionEditorProps) {
  const t = useTranslations('geoposition');
  const locale = useLocale();
  const mounted = useIsMounted();

  /* ---- Session ---- */
  const [session, setSession] = useState<GeoSession | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .catch(() => {});
  }, []);

  /* ---- Queue navigation ---- */
  const initialIndex = initialObjectNummer
    ? Math.max(
        0,
        objects.findIndex((o) => o.objectnummer === initialObjectNummer),
      )
    : 0;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentObject = objects[currentIndex];

  /* ---- Step state ---- */
  const [step, setStep] = useState<Step>('triage');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ---- Triage state ---- */
  const [reportingProblem, setReportingProblem] = useState(false);
  const [problemText, setProblemText] = useState('');

  /* ---- Location state ---- */
  const [confirmedKeywords, setConfirmedKeywords] = useState<string[]>([]);
  const [rejectedKeywords, setRejectedKeywords] = useState<string[]>([]);
  const [locationType, setLocationType] = useState<LocationType>('building');

  /* ---- Camera state ---- */
  const [cameraLat, setCameraLat] = useState(5.852);
  const [cameraLng, setCameraLng] = useState(-55.2038);
  const [bearing, setBearing] = useState(0);
  const [fieldOfView, setFieldOfView] = useState(60);
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [uncertainty, setUncertainty] = useState<
    'exact' | 'approximate' | 'rough'
  >('approximate');

  /* ---- Map modules (lazy loaded) ---- */
  const [mapModules, setMapModules] = useState<Record<string, unknown> | null>(
    null,
  );
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (step === 'camera') {
      import('react-leaflet').then((mod) => {
        setMapModules(mod as unknown as Record<string, unknown>);
      });
    }
  }, [step]);

  /* ---- Reset state when moving to a new object ---- */
  const resetForObject = useCallback((obj: CollectionObject) => {
    setStep('triage');
    setReportingProblem(false);
    setProblemText('');
    setSubmitError(null);

    // Pre-populate keywords
    setConfirmedKeywords([]);
    setRejectedKeywords([]);
    setLocationType('building');

    // Set initial camera position from geographic keywords
    const firstGeoMatch = obj.geographicKeywords.find(
      (k) => geoCoordinates[k] && k !== 'Suriname (Zuid-Amerika)',
    );
    const fallback = geoCoordinates['Suriname (Zuid-Amerika)'] ||
      geoCoordinates['Paramaribo (stad)'] || { lat: 5.852, lng: -55.2038 };
    const initial = firstGeoMatch ? geoCoordinates[firstGeoMatch] : fallback;

    setCameraLat(initial.lat);
    setCameraLng(initial.lng);
    setBearing(0);
    setFieldOfView(60);
    setRadiusMeters(150);
    setUncertainty('approximate');
  }, []);

  // Initialize on first load
  useEffect(() => {
    if (currentObject) {
      resetForObject(currentObject);
    }
  }, [currentObject, resetForObject]);

  /* ---- Navigation ---- */
  const goToNext = useCallback(() => {
    if (currentIndex < objects.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      resetForObject(objects[nextIdx]);
    }
  }, [currentIndex, objects, resetForObject]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      resetForObject(objects[prevIdx]);
    }
  }, [currentIndex, objects, resetForObject]);

  /* ---- Triage actions ---- */
  const handleTriageYes = () => {
    // Pre-populate confirmed keywords: put all keywords in the "confirmed" column
    setConfirmedKeywords([...currentObject.geographicKeywords]);
    setRejectedKeywords([]);
    setStep('location');
  };

  const handleTriageNo = () => {
    // Skip this object and move to the next
    goToNext();
  };

  /* ---- Location step: keyword management ---- */
  const moveToConfirmed = (keyword: string) => {
    setRejectedKeywords((prev) => prev.filter((k) => k !== keyword));
    setConfirmedKeywords((prev) => [...prev, keyword]);
  };

  const moveToRejected = (keyword: string) => {
    setConfirmedKeywords((prev) => prev.filter((k) => k !== keyword));
    setRejectedKeywords((prev) => [...prev, keyword]);
  };

  const handleLocationNext = () => {
    // Update camera position based on first confirmed keyword with coords
    const match = confirmedKeywords.find(
      (k) => geoCoordinates[k] && k !== 'Suriname (Zuid-Amerika)',
    );
    if (match) {
      setCameraLat(geoCoordinates[match].lat);
      setCameraLng(geoCoordinates[match].lng);
    }
    setStep('camera');
  };

  /* ---- Camera step: submit ---- */
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const payload: ContributionPayload = {
      objectnummer: currentObject.objectnummer,
      lat: cameraLat,
      lng: cameraLng,
      bearing,
      fieldOfView,
      radiusMeters,
      uncertainty,
      isOutdoor: true,
      locationType,
      confirmedKeywords,
    };

    try {
      const response = await fetch('/api/geo-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      setStep('success');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'An error occurred',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---- Auth ---- */
  const handleSignIn = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleSignOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    setSession(null);
  };

  /* ---- Computed ---- */
  const progress = useMemo(() => {
    const done = positionedCount + (step === 'success' ? 1 : 0);
    return {
      done,
      total: totalObjects,
      pct: totalObjects > 0 ? Math.round((done / totalObjects) * 100) : 0,
    };
  }, [positionedCount, totalObjects, step]);

  const isSingleMode = !!initialObjectNummer;

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-(--color-warm-gray)">{t('loading')}</p>
      </div>
    );
  }

  if (!currentObject) {
    return (
      <div className="text-center py-16">
        <Check size={48} className="mx-auto mb-4 text-green-600" />
        <h2 className="text-xl mb-2">{t('allDone')}</h2>
        <p className="text-(--color-warm-gray) mb-6">
          {t('allDoneDescription')}
        </p>
        <Link
          href={`/${locale}/map`}
          className="inline-flex items-center gap-2 px-5 py-3 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors"
        >
          <MapPin size={14} />
          {t('viewOnMap')}
        </Link>
      </div>
    );
  }

  const title = currentObject.titles[0] || currentObject.objectnummer;
  const creator =
    currentObject.creators.filter((c) => c !== 'anoniem').join(', ') ||
    t('anonymous');

  return (
    <div className="space-y-6">
      {/* Header: progress + auth + navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Progress */}
        {!isSingleMode && (
          <div className="flex items-center gap-3">
            <div className="text-sm text-(--color-warm-gray)">
              {t('progress', {
                current: currentIndex + 1,
                total: objects.length,
              })}
            </div>
            <div className="w-32 h-2 bg-(--color-cream-dark) rounded-full overflow-hidden">
              <div
                className="h-full bg-(--color-rijks-red) transition-all duration-300"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <span className="text-xs text-(--color-warm-gray)">
              {progress.pct}%
            </span>
          </div>
        )}

        {/* Auth */}
        <div className="flex items-center gap-2 ml-auto">
          {session ? (
            <div className="flex items-center gap-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.avatarUrl}
                alt={session.username}
                className="w-6 h-6 rounded-full"
              />
              <span className="text-(--color-charcoal)">
                {session.username}
              </span>
              <button
                onClick={handleSignOut}
                className="p-1 text-(--color-warm-gray) hover:text-(--color-charcoal)"
                title={t('signOut')}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors border border-(--color-border)"
            >
              <Github size={14} />
              {t('signIn')}
            </button>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['triage', 'location', 'camera'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRight
                size={14}
                className="text-(--color-warm-gray-light)"
              />
            )}
            <span
              className={
                step === s
                  ? 'font-semibold text-(--color-charcoal)'
                  : step === 'success' ||
                      ['triage', 'location', 'camera'].indexOf(step) > i
                    ? 'text-(--color-warm-gray)'
                    : 'text-(--color-warm-gray-light)'
              }
            >
              {t(`step${i + 1}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Object info bar */}
      <div className="flex items-start gap-4 p-4 bg-(--color-cream-dark) border border-(--color-border)">
        <div className="w-16 h-16 shrink-0 bg-(--color-cream) border border-(--color-border) overflow-hidden">
          {currentObject.thumbnailUrl && (
            <ObjectImage
              src={currentObject.thumbnailUrl}
              alt={title}
              width={64}
              height={64}
              className="object-cover w-full h-full"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          <p className="text-xs text-(--color-warm-gray)">{creator}</p>
          <p className="text-xs text-(--color-warm-gray-light) font-mono mt-0.5">
            {currentObject.objectnummer}
          </p>
        </div>
        {/* Queue navigation */}
        {!isSingleMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="p-1.5 text-(--color-warm-gray) hover:text-(--color-charcoal) disabled:opacity-30"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={goToNext}
              disabled={currentIndex >= objects.length - 1}
              className="p-1.5 text-(--color-warm-gray) hover:text-(--color-charcoal) disabled:opacity-30"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ================================================
          STEP 1: TRIAGE
          ================================================ */}
      {step === 'triage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Image */}
          <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark) border border-(--color-border)">
            <ObjectImage
              src={currentObject.imageUrl || currentObject.thumbnailUrl}
              alt={title}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {!currentObject.hasImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-(--color-warm-gray)">{t('noImage')}</p>
              </div>
            )}
          </div>

          {/* Triage question */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('triageTitle')}</h3>
              <p className="text-sm text-(--color-warm-gray) leading-relaxed">
                {t('triageDescription')}
              </p>
            </div>

            {/* Keywords preview */}
            {currentObject.geographicKeywords.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                  {t('existingKeywords')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentObject.geographicKeywords.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-(--color-cream) text-xs text-(--color-charcoal-light) border border-(--color-border)"
                    >
                      <MapPin size={10} />
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description excerpt */}
            {currentObject.description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                  {t('description')}
                </p>
                <p className="text-sm text-(--color-charcoal-light) leading-relaxed line-clamp-4">
                  {currentObject.description.split('$')[0]}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleTriageYes}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors"
              >
                <Eye size={16} />
                {t('triageYes')}
              </button>

              <button
                onClick={handleTriageNo}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 border border-(--color-border) text-sm text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors"
              >
                <SkipForward size={16} />
                {t('triageNo')}
              </button>

              {!reportingProblem ? (
                <button
                  onClick={() => setReportingProblem(true)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs text-(--color-warm-gray) hover:text-(--color-charcoal) transition-colors"
                >
                  <Flag size={12} />
                  {t('reportProblem')}
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                    placeholder={t('problemPlaceholder')}
                    className="w-full p-3 text-sm border border-(--color-border) bg-(--color-cream) focus:outline-none focus:ring-1 focus:ring-(--color-charcoal)"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setReportingProblem(false);
                        goToNext();
                      }}
                      className="flex-1 px-4 py-2 text-sm bg-(--color-rijks-red) text-white hover:opacity-90"
                    >
                      {t('submitReport')}
                    </button>
                    <button
                      onClick={() => setReportingProblem(false)}
                      className="px-4 py-2 text-sm border border-(--color-border) hover:bg-(--color-cream-dark)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================
          STEP 2: LOCATION IDENTIFICATION
          ================================================ */}
      {step === 'location' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Image */}
          <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark) border border-(--color-border)">
            <ObjectImage
              src={currentObject.imageUrl || currentObject.thumbnailUrl}
              alt={title}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          {/* Location identification */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                {t('locationTitle')}
              </h3>
              <p className="text-sm text-(--color-warm-gray) leading-relaxed">
                {t('locationDescription')}
              </p>
            </div>

            {/* Confirmed keywords column */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-2">
                {t('visibleInImage')}
              </p>
              <div className="min-h-[48px] p-2 border-2 border-dashed border-green-300 bg-green-50/50">
                {confirmedKeywords.length === 0 ? (
                  <p className="text-xs text-(--color-warm-gray-light) italic p-1">
                    {t('dragHere')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {confirmedKeywords.map((k) => (
                      <button
                        key={k}
                        onClick={() => moveToRejected(k)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-xs text-green-800 hover:bg-green-200 transition-colors"
                      >
                        <Check size={10} />
                        {k}
                        <X size={10} className="ml-1 opacity-50" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rejected keywords column */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                {t('notVisible')}
              </p>
              <div className="min-h-[48px] p-2 border-2 border-dashed border-(--color-border) bg-(--color-cream-dark)">
                {rejectedKeywords.length === 0 ? (
                  <p className="text-xs text-(--color-warm-gray-light) italic p-1">
                    {t('moveHere')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rejectedKeywords.map((k) => (
                      <button
                        key={k}
                        onClick={() => moveToConfirmed(k)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-(--color-cream) text-xs text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors border border-(--color-border)"
                      >
                        {k}
                        <ArrowRight size={10} className="ml-1 opacity-50" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Location type selector */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-(--color-warm-gray) mb-2">
                {t('locationType')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    'street',
                    'building',
                    'landscape',
                    'waterway',
                    'other',
                  ] as const
                ).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLocationType(type)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      locationType === type
                        ? 'bg-(--color-charcoal) text-white'
                        : 'bg-(--color-cream-dark) text-(--color-charcoal-light) hover:bg-(--color-cream) border border-(--color-border)'
                    }`}
                  >
                    {t(`type_${type}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('triage')}
                className="flex items-center gap-2 px-4 py-2.5 text-sm border border-(--color-border) hover:bg-(--color-cream-dark) transition-colors"
              >
                <ArrowLeft size={14} />
                {t('back')}
              </button>
              <button
                onClick={handleLocationNext}
                disabled={confirmedKeywords.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors disabled:opacity-40"
              >
                {t('confirmLocation')}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================
          STEP 3: CAMERA PLACEMENT
          ================================================ */}
      {step === 'camera' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">{t('cameraTitle')}</h3>
            <p className="text-sm text-(--color-warm-gray)">
              {t('cameraDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Map (3/5) */}
            <div className="lg:col-span-3">
              <div className="relative z-0 h-[500px] border border-(--color-border) bg-(--color-cream-dark) overflow-hidden">
                {mapModules ? (
                  <CameraMap
                    mapModules={mapModules}
                    mapRef={mapRef}
                    lat={cameraLat}
                    lng={cameraLng}
                    bearing={bearing}
                    fieldOfView={fieldOfView}
                    radiusMeters={radiusMeters}
                    onPositionChange={(lat, lng) => {
                      setCameraLat(lat);
                      setCameraLng(lng);
                    }}
                    onBearingChange={setBearing}
                    onFieldOfViewChange={setFieldOfView}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-(--color-warm-gray)">
                      {t('loadingMap')}
                    </p>
                  </div>
                )}

                {/* Map overlay instructions */}
                <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm px-3 py-2 text-xs text-(--color-charcoal) max-w-[240px] shadow-sm border border-(--color-border)">
                  <div className="flex items-start gap-2">
                    <Crosshair
                      size={14}
                      className="shrink-0 mt-0.5 text-(--color-rijks-red)"
                    />
                    <p>{t('cameraInstructions')}</p>
                  </div>
                </div>
              </div>

              {/* Camera controls */}
              <div className="flex flex-wrap gap-4 mt-3 px-1 text-sm">
                <div className="flex items-center gap-2">
                  <Move size={14} className="text-(--color-warm-gray)" />
                  <span className="text-(--color-warm-gray)">
                    {t('position')}:
                  </span>
                  <span className="font-mono text-xs">
                    {cameraLat.toFixed(5)}, {cameraLng.toFixed(5)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Camera size={14} className="text-(--color-warm-gray)" />
                  <span className="text-(--color-warm-gray)">
                    {t('bearingLabel')}:
                  </span>
                  <input
                    type="number"
                    value={bearing}
                    onChange={(e) =>
                      setBearing(
                        Math.max(
                          0,
                          Math.min(360, parseInt(e.target.value) || 0),
                        ),
                      )
                    }
                    className="w-16 px-2 py-1 text-xs font-mono border border-(--color-border) bg-(--color-cream)"
                    min={0}
                    max={360}
                  />
                  <span className="text-xs text-(--color-warm-gray)">°</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye size={14} className="text-(--color-warm-gray)" />
                  <span className="text-(--color-warm-gray)">
                    {t('fovLabel')}:
                  </span>
                  <input
                    type="range"
                    value={fieldOfView}
                    onChange={(e) => setFieldOfView(parseInt(e.target.value))}
                    className="w-24"
                    min={5}
                    max={170}
                  />
                  <span className="text-xs font-mono">{fieldOfView}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler size={14} className="text-(--color-warm-gray)" />
                  <span className="text-(--color-warm-gray)">
                    {t('distanceLabel')}:
                  </span>
                  <input
                    type="range"
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(parseInt(e.target.value))}
                    className="w-24"
                    min={10}
                    max={500}
                    step={10}
                  />
                  <span className="text-xs font-mono">{radiusMeters}m</span>
                </div>
              </div>

              {/* Uncertainty selector */}
              <div className="flex items-center gap-3 mt-2 px-1">
                <span className="text-sm text-(--color-warm-gray)">
                  {t('uncertaintyLabel')}:
                </span>
                <div className="flex gap-1.5">
                  {(['exact', 'approximate', 'rough'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setUncertainty(level)}
                      className={`px-3 py-1 text-xs transition-colors ${
                        uncertainty === level
                          ? level === 'exact'
                            ? 'bg-green-700 text-white'
                            : level === 'approximate'
                              ? 'bg-amber-600 text-white'
                              : 'bg-orange-700 text-white'
                          : 'bg-(--color-cream-dark) text-(--color-charcoal-light) hover:bg-(--color-cream) border border-(--color-border)'
                      }`}
                    >
                      {t(`uncertainty_${level}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Image reference (2/5) */}
            <div className="lg:col-span-2">
              <div className="relative aspect-4/3 overflow-hidden bg-(--color-cream-dark) border border-(--color-border)">
                <ObjectImage
                  src={currentObject.imageUrl || currentObject.thumbnailUrl}
                  alt={title}
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-(--color-charcoal)">
                  {title}
                </p>
                <p className="text-xs text-(--color-warm-gray)">
                  {creator}
                  {currentObject.dateStart &&
                    ` — ${currentObject.dateStart === currentObject.dateEnd ? currentObject.dateStart : `${currentObject.dateStart}–${currentObject.dateEnd}`}`}
                </p>
                {confirmedKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {confirmedKeywords.map((k) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 bg-green-100 text-[10px] text-green-800"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('location')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-(--color-border) hover:bg-(--color-cream-dark) transition-colors"
            >
              <ArrowLeft size={14} />
              {t('back')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-(--color-rijks-red) text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? (
                t('submitting')
              ) : (
                <>
                  <Camera size={16} />
                  {t('savePosition')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================
          SUCCESS
          ================================================ */}
      {step === 'success' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <Check size={32} className="text-green-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{t('successTitle')}</h3>
          <p className="text-sm text-(--color-warm-gray) mb-8 max-w-md mx-auto">
            {t('successDescription')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {!isSingleMode && currentIndex < objects.length - 1 && (
              <button
                onClick={goToNext}
                className="inline-flex items-center gap-2 px-5 py-3 bg-(--color-charcoal) text-white text-sm font-semibold hover:bg-(--color-charcoal-light) transition-colors"
              >
                <ArrowRight size={14} />
                {t('nextObject')}
              </button>
            )}
            <Link
              href={`/${locale}/object/${encodeURIComponent(currentObject.objectnummer)}`}
              className="inline-flex items-center gap-2 px-5 py-3 border border-(--color-border) text-sm text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors"
            >
              {t('viewObject')}
            </Link>
            <Link
              href={`/${locale}/map`}
              className="inline-flex items-center gap-2 px-5 py-3 border border-(--color-border) text-sm text-(--color-charcoal-light) hover:bg-(--color-cream-dark) transition-colors"
            >
              <MapPin size={14} />
              {t('viewOnMap')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Camera Map sub-component ---- */

interface CameraMapProps {
  mapModules: Record<string, unknown>;
  mapRef: React.MutableRefObject<unknown>;
  lat: number;
  lng: number;
  bearing: number;
  fieldOfView: number;
  radiusMeters: number;
  onPositionChange: (lat: number, lng: number) => void;
  onBearingChange: (bearing: number) => void;
  onFieldOfViewChange: (fov: number) => void;
}

function CameraMap({
  mapModules,
  lat,
  lng,
  bearing,
  fieldOfView,
  radiusMeters,
  onPositionChange,
  onBearingChange,
  onFieldOfViewChange,
}: CameraMapProps) {
  const MapContainer = mapModules.MapContainer as React.ComponentType<
    Record<string, unknown>
  >;
  const TileLayer = mapModules.TileLayer as React.ComponentType<
    Record<string, unknown>
  >;
  const Marker = mapModules.Marker as React.ComponentType<
    Record<string, unknown>
  >;
  const useMapEvents = mapModules.useMapEvents as (
    events: Record<string, unknown>,
  ) => unknown;

  const [L, setL] = useState<typeof import('leaflet') | null>(null);

  useEffect(() => {
    import('leaflet').then(setL);
    // @ts-expect-error -- CSS import has no type declarations
    import('leaflet/dist/leaflet.css');
  }, []);

  if (!L) return null;

  // Custom camera icon
  const cameraIcon = L.divIcon({
    html: `<div style="
      width: 24px; height: 24px;
      background: #c0503e;
      border: 2px solid #1a1a1a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4" fill="none" stroke="white" stroke-width="2"/></svg></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Draggable camera marker */}
      <Marker
        position={[lat, lng]}
        icon={cameraIcon}
        draggable={true}
        eventHandlers={{
          dragend: (e: {
            target: { getLatLng: () => { lat: number; lng: number } };
          }) => {
            const pos = e.target.getLatLng();
            onPositionChange(pos.lat, pos.lng);
          },
        }}
      />

      {/* Viewing cone */}
      <ViewingConeInner
        mapModules={mapModules}
        useMapEvents={useMapEvents}
        lat={lat}
        lng={lng}
        bearing={bearing}
        fieldOfView={fieldOfView}
        radiusMeters={radiusMeters}
        onBearingChange={onBearingChange}
        onFieldOfViewChange={onFieldOfViewChange}
      />

      {/* Click to reposition camera */}
      <MapClickHandler
        useMapEvents={useMapEvents}
        onPositionChange={onPositionChange}
      />
    </MapContainer>
  );
}

function ViewingConeInner({
  mapModules,
  useMapEvents,
  lat,
  lng,
  bearing,
  fieldOfView,
  radiusMeters,
  onBearingChange,
  onFieldOfViewChange,
}: {
  mapModules: Record<string, unknown>;
  useMapEvents: (events: Record<string, unknown>) => unknown;
  lat: number;
  lng: number;
  bearing: number;
  fieldOfView: number;
  radiusMeters: number;
  onBearingChange: (bearing: number) => void;
  onFieldOfViewChange: (fov: number) => void;
}) {
  // Import ViewingCone dynamically (it imports from react-leaflet internally)
  const [ViewingConeComponent, setViewingConeComponent] =
    useState<React.ComponentType<
      import('./ViewingCone').ViewingConeProps
    > | null>(null);

  useEffect(() => {
    import('./ViewingCone').then((mod) => {
      setViewingConeComponent(() => mod.default);
    });
  }, []);

  // Suppress unused variable warnings — these are used to pass context
  void mapModules;
  void useMapEvents;

  if (!ViewingConeComponent) return null;

  return (
    <ViewingConeComponent
      lat={lat}
      lng={lng}
      bearing={bearing}
      fieldOfView={fieldOfView}
      editable
      radiusMeters={radiusMeters}
      color="#c0503e"
      fillOpacity={0.25}
      onBearingChange={onBearingChange}
      onFieldOfViewChange={onFieldOfViewChange}
    />
  );
}

function MapClickHandler({
  useMapEvents,
  onPositionChange,
}: {
  useMapEvents: (events: Record<string, unknown>) => unknown;
  onPositionChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    contextmenu: (e: {
      latlng: { lat: number; lng: number };
      originalEvent: Event;
    }) => {
      e.originalEvent.preventDefault();
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
