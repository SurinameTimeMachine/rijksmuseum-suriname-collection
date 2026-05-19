'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

interface TimeSliderControlProps {
  minYear: number;
  maxYear: number;
  fromYear: number;
  toYear: number;
  onChange: (from: number, to: number) => void;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
}

const ANIMATION_DURATION_MS = 15000;

export default function TimeSliderControl({
  minYear,
  maxYear,
  fromYear,
  toYear,
  onChange,
  isPlaying,
  onPlayingChange,
}: TimeSliderControlProps) {
  const t = useTranslations('explore');

  /* Animation loop */
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Refs so the animation closure always reads the latest slider values
  const fromYearRef = useRef(fromYear);
  const toYearRef = useRef(toYear);

  useEffect(() => {
    fromYearRef.current = fromYear;
    toYearRef.current = toYear;
  }, [fromYear, toYear]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startTimeRef.current = null;
      return;
    }

    // Snapshot the window at the moment play is pressed
    const startFrom = fromYearRef.current;
    const windowYears = Math.max(1, toYearRef.current - fromYearRef.current);
    const totalSpan = maxYear - startFrom;

    if (totalSpan <= 0) {
      onPlayingChange(false);
      return;
    }

    const tick = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);
      const upper = Math.round(
        startFrom + windowYears + progress * (totalSpan - windowYears),
      );
      const lower = Math.round(upper - windowYears);
      onChange(
        Math.max(minYear, Math.min(maxYear, lower)),
        Math.max(minYear, Math.min(maxYear, upper)),
      );

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onPlayingChange(false);
        onChange(minYear, maxYear);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, minYear, maxYear]);

  const handleFromChange = (next: number) => {
    onPlayingChange(false);
    const clamped = Math.max(minYear, Math.min(maxYear, next));
    onChange(Math.min(clamped, toYear), toYear);
  };
  const handleToChange = (next: number) => {
    onPlayingChange(false);
    const clamped = Math.max(minYear, Math.min(maxYear, next));
    onChange(fromYear, Math.max(clamped, fromYear));
  };

  const reset = () => {
    onPlayingChange(false);
    onChange(minYear, maxYear);
  };

  const yearSpan = maxYear - minYear;
  const fromPct = yearSpan > 0 ? ((fromYear - minYear) / yearSpan) * 100 : 0;
  const toPct = yearSpan > 0 ? ((toYear - minYear) / yearSpan) * 100 : 100;

  return (
    <div className="border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_15px_35px_rgba(0,30,24,0.08)] backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => onPlayingChange(!isPlaying)}
          className="shrink-0 border border-ink/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/70 transition-colors hover:border-teal-strong hover:text-teal-strong"
          aria-label={isPlaying ? t('pause') : t('play')}
        >
          {isPlaying ? t('pause') : t('play')}
        </button>
        <button
          onClick={reset}
          className="shrink-0 border border-slate-200 px-2 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-ink/60 transition-colors hover:border-teal-strong/40 hover:text-teal-strong"
          aria-label={t('reset')}
        >
          {t('reset')}
        </button>
        <div className="ml-auto flex items-center gap-1 tabular-nums">
          <span className="text-sm font-semibold text-ink">{fromYear}</span>
          <span className="text-[10px] text-ink/35">-</span>
          <span className="text-sm font-semibold text-ink">{toYear}</span>
        </div>
      </div>

      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-teal-strong"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />

        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={fromYear}
          onChange={(e) => handleFromChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-strong [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_4px_12px_rgba(0,30,24,0.18)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-teal-strong [&::-moz-range-thumb]:bg-white"
          aria-label={t('from')}
        />

        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={toYear}
          onChange={(e) => handleToChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-strong [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_4px_12px_rgba(0,30,24,0.18)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-teal-strong [&::-moz-range-thumb]:bg-white"
          aria-label={t('to')}
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.2em] text-ink/45 tabular-nums">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  );
}
