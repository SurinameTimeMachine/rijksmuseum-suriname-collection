'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
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
const ANIMATION_WINDOW_YEARS = 50;

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

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startTimeRef.current = null;
      return;
    }

    const totalSpan = maxYear - minYear;
    if (totalSpan <= 0) {
      onPlayingChange(false);
      return;
    }
    const windowYears = Math.min(ANIMATION_WINDOW_YEARS, totalSpan);

    const tick = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);
      const upper = Math.round(
        minYear + windowYears + progress * (totalSpan - windowYears),
      );
      const lower = Math.round(upper - windowYears);
      onChange(lower, upper);

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
    onChange(Math.min(next, toYear), toYear);
  };
  const handleToChange = (next: number) => {
    onPlayingChange(false);
    onChange(fromYear, Math.max(next, fromYear));
  };

  const reset = () => {
    onPlayingChange(false);
    onChange(minYear, maxYear);
  };

  const fromPct = ((fromYear - minYear) / (maxYear - minYear)) * 100;
  const toPct = ((toYear - minYear) / (maxYear - minYear)) * 100;

  return (
    <div className="bg-(--color-card)/95 backdrop-blur-md border border-(--color-border) p-4 shadow-lg">
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => onPlayingChange(!isPlaying)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-(--color-charcoal) text-white text-xs font-semibold hover:bg-(--color-charcoal-light) transition-colors"
          aria-label={isPlaying ? t('pause') : t('play')}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? t('pause') : t('play')}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-transparent text-(--color-charcoal-light) text-xs font-medium hover:bg-(--color-cream-dark) border border-(--color-border) transition-colors"
          aria-label={t('reset')}
        >
          <RotateCcw size={12} />
          {t('reset')}
        </button>
        <div className="ml-auto text-xs text-(--color-warm-gray) tabular-nums">
          <span className="font-serif text-base font-bold text-(--color-charcoal)">
            {fromYear}
          </span>
          <span className="mx-2 text-(--color-warm-gray-light)">—</span>
          <span className="font-serif text-base font-bold text-(--color-charcoal)">
            {toYear}
          </span>
        </div>
      </div>

      {/* Dual-handle range slider */}
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-(--color-border) rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-(--color-rijks-red) rounded-full"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={fromYear}
          onChange={(e) => handleFromChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--color-rijks-red) [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--color-rijks-red) [&::-moz-range-thumb]:cursor-pointer"
          aria-label={t('from')}
        />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={toYear}
          onChange={(e) => handleToChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--color-rijks-red) [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--color-rijks-red) [&::-moz-range-thumb]:cursor-pointer"
          aria-label={t('to')}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-(--color-warm-gray-light) tabular-nums">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  );
}
