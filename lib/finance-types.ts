// Tipos centralizados para el módulo de finanzas

export type Account = {
  id: number;
  name: string;
  currency: string;
  type: string;
  balance: number;
  last_updated?: string;
};

export type Category = {
  id: string;
  name: string;
  type: string;
  parent_category: string;
};

export type Transaction = {
  id: string;
  created_at: string;
  transaction_date: string;
  description: string;
  raw_description: string | null;
  amount_original: number;
  currency_original: string;
  amount_usd: number;
  exchange_rate: number;
  status: 'pending_review' | 'verified';
  category_id: string;
  account_id: number | null;
  is_fixed_expense?: boolean;
  is_cac_related?: boolean;
  fin_categories: {
    name: string;
    slug: string;
    type: string;
    parent_category: string;
  } | null;
};

export type MonthlyMetric = {
  id: string;
  month_date: string;
  new_customers_count: number;
};

export type DateRangePreset = 'current_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'all' | 'custom';
export type FilterStatus = 'pending_review' | 'verified' | 'all';

export type CurrencyEditState = {
  isOpen: boolean;
  transactionId: string | null;
  currentData: {
    amount_original: number;
    currency_original: string;
    amount_usd: number;
  } | null;
};

// Tipos de cambio en vivo
export type ExchangeRatesData = {
  rates: Record<string, number>;
  date: string | null;
  isLive: boolean;
};

// Tasas de cambio por defecto (fallback)
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  PEN: 3.75,
  CLP: 950,
  MXN: 17.5,
  COP: 4000,
  EUR: 0.92,
};

// Helper: recalcular valores de transacción
export const calculateTransactionValues = (
  currency: string,
  amountOriginal: number,
  amountUsdInput: number
) => {
  if (currency === 'USD') {
    return {
      amount_original: amountOriginal,
      currency_original: 'USD',
      amount_usd: amountOriginal,
      exchange_rate: 1,
    };
  }

  const safeAmountUsd = amountUsdInput !== 0 ? amountUsdInput : 1;
  const exchangeRate = amountOriginal / safeAmountUsd;

  return {
    amount_original: amountOriginal,
    currency_original: currency,
    amount_usd: amountUsdInput,
    exchange_rate: exchangeRate,
  };
};

// P&L data structure
export interface PnLData {
  sortedMonths: string[];
  matrix: Record<string, Record<string, Record<string, number>>>;
  detailMatrix: Record<string, Record<string, Record<string, Record<string, number>>>>;
}
