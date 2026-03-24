'use client';

import { useState, useEffect } from 'react';
import { EXCHANGE_RATES } from '@/lib/finance-types';
import type { ExchangeRatesData } from '@/lib/finance-types';

const API_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

export function useExchangeRates(): ExchangeRatesData {
  const [data, setData] = useState<ExchangeRatesData>({
    rates: EXCHANGE_RATES,
    date: null,
    isLive: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(API_URL, { signal: controller.signal })
      .then(res => res.json())
      .then(json => {
        clearTimeout(timeout);
        const rawRates = json.usd || {};
        const rates: Record<string, number> = { USD: 1 };

        // Map API keys (lowercase) to our format (uppercase), fallback per currency
        for (const key of Object.keys(EXCHANGE_RATES)) {
          if (key === 'USD') continue;
          const lowerKey = key.toLowerCase();
          rates[key] = rawRates[lowerKey] ?? EXCHANGE_RATES[key];
        }

        setData({ rates, date: json.date ?? null, isLive: true });
      })
      .catch(() => {
        clearTimeout(timeout);
        // Keep fallback — already set as initial state
      });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  return data;
}
