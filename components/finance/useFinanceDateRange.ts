'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { DateRangePreset, Transaction } from '@/lib/finance-types';

export function useFinanceDateRange() {
  const [dateRange, setDateRange] = useState<DateRangePreset>('last_12_months');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');

  useEffect(() => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start = '';

    if (dateRange === 'current_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (dateRange === 'last_3_months') {
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
    } else if (dateRange === 'last_6_months') {
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0];
    } else if (dateRange === 'last_12_months') {
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
    }

    if (dateRange !== 'all' && dateRange !== 'custom') {
      setTempStart(start);
      setTempEnd(end);
    }
  }, [dateRange]);

  const filterByDate = useCallback(
    (tx: Transaction) => {
      if (dateRange === 'all') return true;

      if (dateRange === 'custom') {
        if (!customStart || !customEnd) return true;
        return tx.transaction_date >= customStart && tx.transaction_date <= customEnd;
      }

      const txDate = new Date(tx.transaction_date);
      const now = new Date();
      now.setHours(23, 59, 59, 999);

      if (dateRange === 'current_month') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      }

      let monthsBack = 0;
      if (dateRange === 'last_3_months') monthsBack = 2;
      else if (dateRange === 'last_6_months') monthsBack = 5;
      else if (dateRange === 'last_12_months') monthsBack = 11;

      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
      startDate.setHours(0, 0, 0, 0);

      return txDate >= startDate;
    },
    [dateRange, customStart, customEnd]
  );

  // ISO range for Supabase queries
  const dateRangeISO = useMemo(() => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];

    if (dateRange === 'all') return { start: '2020-01-01', end };
    if (dateRange === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }

    let monthsBack = 0;
    if (dateRange === 'current_month') monthsBack = 0;
    else if (dateRange === 'last_3_months') monthsBack = 2;
    else if (dateRange === 'last_6_months') monthsBack = 5;
    else if (dateRange === 'last_12_months') monthsBack = 11;

    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).toISOString().split('T')[0];
    return { start, end };
  }, [dateRange, customStart, customEnd]);

  return {
    dateRange,
    setDateRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    tempStart,
    setTempStart,
    tempEnd,
    setTempEnd,
    filterByDate,
    dateRangeISO,
  };
}
