'use client';

import { useState, useMemo } from 'react';

export type PresetKey = '7d' | '14d' | '30d' | 'month' | 'custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: PresetKey): DateRange {
  const now = new Date();
  const to = formatDate(now);

  if (preset === 'month') {
    const from = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from, to };
  }

  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return { from: formatDate(fromDate), to };
}

export function useDateRange() {
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range: DateRange = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  return {
    preset,
    setPreset,
    range,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
  };
}
