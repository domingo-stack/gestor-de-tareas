'use client';

import { useState, useEffect, useCallback } from 'react';

export type CurrencyMode = 'PEN' | 'USD';

export interface CurrencyToggle {
  mode: CurrencyMode;
  setMode: (m: CurrencyMode) => void;
  convert: (penAmount: number) => number;
  fmtMoney: (penAmount: number) => string;
  rate: number | null;
  isLive: boolean;
}

const FALLBACK_PEN_TO_USD = 0.27; // ~3.7 PEN per USD

export function useCurrencyToggle(): CurrencyToggle {
  const [mode, setMode] = useState<CurrencyMode>('PEN');
  const [penToUsd, setPenToUsd] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(json => {
        clearTimeout(timeout);
        const penRate = json.usd?.pen;
        if (penRate && penRate > 0) {
          setPenToUsd(1 / penRate); // pen→usd = 1/usd→pen
          setIsLive(true);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
      });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  const effectiveRate = penToUsd ?? FALLBACK_PEN_TO_USD;

  const convert = useCallback(
    (penAmount: number) => mode === 'USD' ? penAmount * effectiveRate : penAmount,
    [mode, effectiveRate],
  );

  const fmtMoney = useCallback(
    (penAmount: number) => {
      const value = convert(penAmount);
      if (mode === 'USD') {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      }
      return `S/ ${new Intl.NumberFormat('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)}`;
    },
    [mode, convert],
  );

  return { mode, setMode, convert, fmtMoney, rate: penToUsd, isLive };
}
