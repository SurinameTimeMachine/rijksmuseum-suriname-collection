'use client';

interface HistoricalMapControlsProps {
  activeMap: 'suriname' | 'paramaribo' | 'none';
  onActiveMapChange: (map: 'suriname' | 'paramaribo' | 'none') => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export default function HistoricalMapControls({
  activeMap,
  onActiveMapChange,
  opacity,
  onOpacityChange,
}: HistoricalMapControlsProps) {
  const options: Array<{
    value: 'none' | 'suriname' | 'paramaribo';
    label: string;
    detail: string;
  }> = [
    {
      value: 'none',
      label: 'Off',
      detail: 'Modern basemap only',
    },
    {
      value: 'suriname',
      label: 'Suriname 1930',
      detail: 'Leiden University map',
    },
    {
      value: 'paramaribo',
      label: 'Paramaribo Streets',
      detail: 'Historic street overlay',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-(--color-warm-gray)">
        Overlay
      </p>

      <div className="grid grid-cols-1 gap-1.5">
        {options.map((option) => {
          const isActive = option.value === activeMap;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onActiveMapChange(option.value)}
              className={`w-full border px-2.5 py-2 text-left transition-colors ${
                isActive
                  ? 'border-(--color-charcoal) bg-(--color-cream-dark)'
                  : 'border-(--color-border) bg-white hover:bg-(--color-cream)'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-(--color-charcoal)">
                  {option.label}
                </span>
                {isActive && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-(--color-charcoal-light)">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-(--color-warm-gray)">
                {option.detail}
              </p>
            </button>
          );
        })}
      </div>

      {activeMap !== 'none' && (
        <div className="mt-1 border border-(--color-border) bg-white px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="historical-opacity"
              className="text-[11px] font-medium text-(--color-charcoal)"
            >
              Overlay opacity
            </label>
            <span className="text-[11px] tabular-nums text-(--color-warm-gray)">
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <input
            id="historical-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-full accent-(--color-charcoal)"
          />
        </div>
      )}
    </div>
  );
}
