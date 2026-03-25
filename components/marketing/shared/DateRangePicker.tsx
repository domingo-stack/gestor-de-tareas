'use client';

import { PresetKey } from './useDateRange';

interface DateRangePickerProps {
  preset: PresetKey;
  onPresetChange: (p: PresetKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '14d', label: '14 días' },
  { value: '30d', label: '30 días' },
  { value: 'month', label: 'Mes actual' },
  { value: 'custom', label: 'Personalizado' },
];

export default function DateRangePicker({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => onPresetChange(p.value)}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            preset === p.value
              ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-gray-700"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-gray-700"
          />
        </div>
      )}
    </div>
  );
}
