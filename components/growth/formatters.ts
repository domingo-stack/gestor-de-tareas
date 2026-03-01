/**
 * Formatea un número con separadores de miles y máximo 2 decimales.
 * Ejemplos: 1234567.891 → "1,234,567.89"   |   42 → "42"
 */
export function fmtNum(value: number | undefined | null): string {
  if (value === undefined || value === null) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formatea como moneda USD con separadores de miles y 2 decimales.
 * Ejemplos: 1234567.891 → "$1,234,567.89"   |   0 → "$0.00"
 */
export function fmtUSD(value: number | undefined | null): string {
  if (value === undefined || value === null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formatea moneda abreviada para tablas compactas.
 * Ejemplos: 1500 → "$1.5k"   |   1234567 → "$1,234.57k"   |   500 → "$500"
 */
export function fmtUSDShort(value: number | undefined | null): string {
  if (!value) return '$0';
  if (value >= 1000) return `$${fmtNum(value / 1000)}k`;
  return `$${fmtNum(value)}`;
}

/**
 * Formatea porcentaje con 1 decimal.
 * Ejemplo: 75.567 → "75.6%"
 */
export function fmtPct(value: number | undefined | null): string {
  if (value === undefined || value === null) return '0%';
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}
