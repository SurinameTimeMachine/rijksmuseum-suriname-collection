'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* Historical Map Selector */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
        >
          <span>
            {activeMap === 'suriname'
              ? '1930 Suriname Map'
              : activeMap === 'paramaribo'
                ? 'Historical Streets'
                : 'No Historical Map'}
          </span>
          <ChevronDown
            size={16}
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10">
            {[
              { value: 'none', label: 'No Historical Map' },
              { value: 'suriname', label: '1930 Suriname Map' },
              { value: 'paramaribo', label: 'Historical Streets' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onActiveMapChange(
                    option.value as 'suriname' | 'paramaribo' | 'none',
                  );
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                  activeMap === option.value
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Opacity Slider - only show if a map is active */}
      {activeMap !== 'none' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-700">
            Transparency: {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
