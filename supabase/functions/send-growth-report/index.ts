// ============================================================================
// send-growth-report — Reporte semanal automatizado para el board
// ============================================================================
// Reemplaza el reporte manual que Arturo arma en Excel cada semana.
// Consume RPCs existentes del dashboard /revenue + get_yoy_revenue_matrix.
//
// Body contract:
//   {}                          → envío real, idempotency guard, todos los
//                                 recipients is_active (requiere CRON_SECRET)
//   { force: true }             → bypass idempotency guard (reenvío manual,
//                                 requiere CRON_SECRET)
//   { week_start_override: "YYYY-MM-DD" } → enviar reporte de una semana
//                                 específica (debe ser un domingo). Útil para
//                                 reenviar semanas pasadas desde la UI.
//                                 Combinable con force: true.
//   { preview: true }           → retorna { html } sin enviar, sin loggear,
//                                 sin upsert snapshot. Para iframe de preview
//                                 desde el dashboard. No requiere CRON_SECRET
//                                 si viene con Authorization Bearer válido.
//   { test: true, to: "email" } → envía solo al email especificado,
//                                 loggea como status='test', no upsert snapshot.
//
// Auth:
//   - CRON_SECRET header (x-cron-secret) o query (?secret=) para envío real
//   - Authorization: Bearer <anon-key> para preview/test desde la UI
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Resend } from 'https://esm.sh/resend';
import {
  emailShell,
  section,
  placeholderSection,
  kpiTable,
  matrix,
  rawCell,
  colorCell,
  arrow,
  narrativeBlock,
  fmtNum,
  fmtUSD,
  fmtPct,
  THRESHOLDS,
  COLOR,
  CHART_COLORS,
  lineChartYoY,
  stackedBarChart,
  combinedBarLineChart,
  multiLineChart,
  type MatrixRow,
  type KpiRow,
} from '../_shared/email-builder.ts';

// ============================================================================
// Constantes
// ============================================================================

const RPC_TIMEOUT_MS = 15000;
const FROM_EMAIL = 'tareas@califica.ai';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

// ============================================================================
// Date helpers — Domingo a Sábado en hora Lima (UTC-5)
// ============================================================================

/** Retorna el domingo de la semana en que cae 'd', en hora Lima */
function getLimaSunday(d: Date): Date {
  // Trasladar a UTC-5 para calcular el día en hora Perú
  const utc5 = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const dow = utc5.getUTCDay(); // 0=Dom, 6=Sáb
  utc5.setUTCDate(utc5.getUTCDate() - dow);
  utc5.setUTCHours(0, 0, 0, 0);
  return new Date(utc5.getUTCFullYear(), utc5.getUTCMonth(), utc5.getUTCDate());
}

/** YYYY-MM-DD sin dependencia de timezone del browser */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtDateEs(d: Date): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ============================================================================
// RPC caller con timeout
// ============================================================================

type RpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function callRpc<T = unknown>(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  name: string,
  params: Record<string, unknown>,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<RpcResult<T>> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    const rpcPromise = supabase.rpc(name, params);
    const result = await Promise.race([rpcPromise, timeoutPromise]);
    if (result?.error) return { ok: false, error: result.error.message || String(result.error) };
    const data = typeof result?.data === 'string' ? JSON.parse(result.data) : result?.data;
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ============================================================================
// Section renderers — cada uno toma el jsonb de una RPC y devuelve HTML
// Si la RPC falló, se devuelve placeholderSection
// ============================================================================

function renderHeadline(
  execSummary: RpcResult<any>,
  churnRenewal: RpcResult<any>,
  yoyMatrix: RpcResult<any>,
): string {
  if (!execSummary.ok && !churnRenewal.ok && !yoyMatrix.ok) {
    return placeholderSection('Headline', 'sin datos');
  }

  const rows: KpiRow[] = [];

  // Revenue semanal total
  if (execSummary.ok && execSummary.data) {
    const d = execSummary.data;
    const revTotal = Number(d.revenue ?? 0);
    const revNew = Number(d.revenue_new ?? 0);
    const revRenewal = Number(d.revenue_recurring ?? 0);
    const revWoW = d.rev_growth_pct !== undefined ? Number(d.rev_growth_pct) : null;

    // YoY desde yoy_matrix (última semana)
    let revYoY: number | null = null;
    if (yoyMatrix.ok && yoyMatrix.data?.weekly?.length) {
      const lastWeek = yoyMatrix.data.weekly[yoyMatrix.data.weekly.length - 1];
      revYoY = lastWeek.growthPct !== undefined && lastWeek.growthPct !== null
        ? Number(lastWeek.growthPct)
        : null;
    }

    rows.push({
      label: 'Revenue Total (semana)',
      value: fmtUSD(revTotal),
      color: COLOR.neutral,
      deltaWoW: revWoW,
      deltaYoY: revYoY,
    });
    if (revNew) rows.push({ label: 'Revenue Nuevo', value: fmtUSD(revNew), color: '#3b82f6' });
    if (revRenewal) rows.push({ label: 'Revenue Recurrente', value: fmtUSD(revRenewal), color: COLOR.green });
    if (d.transactions) rows.push({ label: 'Transacciones', value: fmtNum(d.transactions), color: COLOR.neutral });
    if (d.arpu) rows.push({ label: 'ARPU', value: fmtUSD(d.arpu), color: COLOR.neutral });
  }

  // Usuarios cuenta vigente + Churn — viene del último churn_week
  if (churnRenewal.ok && churnRenewal.data?.churn_weeks?.length) {
    const lastChurn = churnRenewal.data.churn_weeks[churnRenewal.data.churn_weeks.length - 1];
    if (lastChurn.netUsers !== undefined) {
      rows.push({
        label: 'Usuarios cuenta vigente',
        value: fmtNum(lastChurn.netUsers),
        sublabel: `Starting ${fmtNum(lastChurn.startingUsers)} → +${fmtNum(lastChurn.newPaid)} nuevos − ${fmtNum(lastChurn.churnedUsers)} churn`,
        color: COLOR.neutral,
      });
    }
    if (lastChurn.churnRate !== undefined) {
      const cr = Number(lastChurn.churnRate);
      const color = cr <= 2 ? COLOR.green : cr <= 5 ? COLOR.yellow : COLOR.red;
      rows.push({ label: 'Churn Rate semanal', value: fmtPct(cr), color });
    }
    if (lastChurn.growthRate !== undefined) {
      rows.push({
        label: 'Growth Rate semanal',
        value: fmtPct(Number(lastChurn.growthRate)),
        color: Number(lastChurn.growthRate) >= 0 ? COLOR.green : COLOR.red,
      });
    }
  }

  // Registros y activación de la última semana (viene de execSummary.weekly_trend)
  if (execSummary.ok && execSummary.data?.weekly_trend?.length) {
    const lastTrend = execSummary.data.weekly_trend[execSummary.data.weekly_trend.length - 1];
    if (lastTrend.registrations !== undefined) {
      rows.push({
        label: 'Nuevos Registros',
        value: fmtNum(lastTrend.registrations),
        color: COLOR.neutral,
      });
    }
  }

  if (rows.length === 0) return placeholderSection('Headline');
  return section('Headline · Semana cerrada', kpiTable(rows));
}

function renderVentasSemanales(execSummary: RpcResult<any>): string {
  if (!execSummary.ok) return placeholderSection('Ventas Semanales', execSummary.error);
  const trend = execSummary.data?.weekly_trend ?? [];
  if (!trend.length) return placeholderSection('Ventas Semanales');

  const labels = trend.map((w: any) => w.weekLabel ?? '?');
  const nuevos = trend.map((w: any) => Number(w.revenue_new ?? 0));
  const recurrentes = trend.map((w: any) => Number(w.revenue_renewal ?? 0));

  const chart = stackedBarChart({
    title: 'Ventas Semanales: Nuevo vs Recurrente (USD)',
    labels,
    series: [
      { name: 'Nuevo', data: nuevos, color: CHART_COLORS.blue },
      { name: 'Recurrente', data: recurrentes, color: CHART_COLORS.green },
    ],
    yAxisLabel: 'USD',
  });

  // Narrativa últimas 3 semanas
  const last3 = trend.slice(-3);
  const items = last3.map((w: any, i: number) => {
    const isLast = i === last3.length - 1;
    const nuevo = Number(w.revenue_new ?? 0);
    const recurrente = Number(w.revenue_renewal ?? 0);
    const total = nuevo + recurrente;
    const txTotal = Number(w.tx_new ?? 0) + Number(w.tx_renewal ?? 0);
    const marker = isLast ? ' <span style="color:#9ca3af;">← cerrada</span>' : '';
    return `<strong>${w.weekLabel}</strong>: Total <strong style="color:${COLOR.neutral};">${fmtUSD(total)}</strong> · Nuevo <strong style="color:${CHART_COLORS.blue};">${fmtUSD(nuevo)}</strong> · Recurrente <strong style="color:${CHART_COLORS.green};">${fmtUSD(recurrente)}</strong> · ${fmtNum(txTotal)} trxs · ${fmtNum(w.registrations ?? 0)} registros${marker}`;
  });

  return section('Ventas Semanales (8 semanas)', chart + narrativeBlock(items));
}

function renderRevenueYoyWeekly(yoyMatrix: RpcResult<any>): string {
  if (!yoyMatrix.ok) return placeholderSection('Revenue Semanal YoY', yoyMatrix.error);
  const weekly = yoyMatrix.data?.weekly ?? [];
  if (!weekly.length) return placeholderSection('Revenue Semanal YoY');

  const chartRows = weekly.map((w: any) => ({
    label: w.weekLabel ?? '?',
    y2023: Number(w.y2023) > 0 ? Number(w.y2023) : null,
    y2024: Number(w.y2024) > 0 ? Number(w.y2024) : null,
    y2025: Number(w.y2025) > 0 ? Number(w.y2025) : null,
    y2026: Number(w.y2026) > 0 ? Number(w.y2026) : null,
  }));

  const chart = lineChartYoY({
    title: 'Revenue Semanal YoY (USD)',
    rows: chartRows,
    yAxisLabel: 'USD',
  });

  // Narrativa últimas 3 semanas con datos completos
  const last3 = weekly.slice(-3);
  const items = last3.map((w: any, i: number) => {
    const isLast = i === last3.length - 1;
    const yoy = w.growthPct;
    const yoyHtml = yoy !== null && yoy !== undefined
      ? `<strong style="color:${Number(yoy) >= 0 ? COLOR.green : COLOR.red};">${Number(yoy) >= 0 ? '+' : ''}${Number(yoy).toFixed(1)}% YoY</strong>`
      : '<span style="color:#9ca3af;">— YoY</span>';
    const dateRange = w.weekStartCurrent && w.weekEndCurrent
      ? ` (${w.weekStartCurrent.slice(5)} – ${w.weekEndCurrent.slice(5)})`
      : '';
    const marker = isLast ? ' <span style="color:#9ca3af;">← semana cerrada</span>' : '';
    return `<strong>${w.weekLabel}</strong>${dateRange}: <strong style="color:${COLOR.neutral};">${fmtUSD(Number(w.y2026 ?? 0))}</strong> 2026 vs ${fmtUSD(Number(w.y2025 ?? 0))} 2025 · ${yoyHtml}${marker}`;
  });

  return section('Revenue Semanal YoY (12 semanas Dom-Sáb)', chart + narrativeBlock(items));
}

function renderRevenueYoyDaily(yoyMatrix: RpcResult<any>): string {
  if (!yoyMatrix.ok) return placeholderSection('Revenue Diario YoY', yoyMatrix.error);
  const daily = yoyMatrix.data?.daily ?? [];
  if (!daily.length) return placeholderSection('Revenue Diario YoY');

  const chartRows = daily.map((d: any) => ({
    label: d.dayLabel ?? '?',
    y2023: Number(d.y2023) > 0 ? Number(d.y2023) : null,
    y2024: Number(d.y2024) > 0 ? Number(d.y2024) : null,
    y2025: Number(d.y2025) > 0 ? Number(d.y2025) : null,
    y2026: Number(d.y2026) > 0 ? Number(d.y2026) : null,
  }));

  const chart = lineChartYoY({
    title: 'Revenue Diario YoY (últimos 30 días, USD)',
    rows: chartRows,
    yAxisLabel: 'USD',
  });

  // Narrativa: agrupar últimos 21 días en bloques de 7 → 3 bloques semanales
  const sumBlock = (block: any[]) => ({
    y2023: block.reduce((s, d) => s + Number(d.y2023 ?? 0), 0),
    y2024: block.reduce((s, d) => s + Number(d.y2024 ?? 0), 0),
    y2025: block.reduce((s, d) => s + Number(d.y2025 ?? 0), 0),
    y2026: block.reduce((s, d) => s + Number(d.y2026 ?? 0), 0),
    first: block[0]?.dayLabel,
    last: block[block.length - 1]?.dayLabel,
  });
  const last7 = sumBlock(daily.slice(-7));
  const prev7 = sumBlock(daily.slice(-14, -7));
  const prev14 = sumBlock(daily.slice(-21, -14));

  const blockNarrative = (block: ReturnType<typeof sumBlock>, label: string, isLast: boolean) => {
    const yoy = block.y2025 > 0 ? ((block.y2026 - block.y2025) / block.y2025) * 100 : null;
    const yoyHtml = yoy !== null
      ? `<strong style="color:${yoy >= 0 ? COLOR.green : COLOR.red};">${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}% YoY</strong>`
      : '<span style="color:#9ca3af;">— YoY</span>';
    const marker = isLast ? ' <span style="color:#9ca3af;">← más reciente</span>' : '';
    return `<strong>${label}</strong> (${block.first} – ${block.last}): <strong style="color:${COLOR.neutral};">${fmtUSD(block.y2026)}</strong> 2026 vs ${fmtUSD(block.y2025)} 2025 · ${yoyHtml}${marker}`;
  };

  const items = [
    blockNarrative(prev14, 'Hace 3 semanas', false),
    blockNarrative(prev7, 'Hace 2 semanas', false),
    blockNarrative(last7, 'Últimos 7 días', true),
  ];

  return section('Revenue Diario YoY (30 días)', chart + narrativeBlock(items));
}

function renderRevenueByCountry(revByCountry: RpcResult<any>): string {
  if (!revByCountry.ok) return placeholderSection('Revenue por País', revByCountry.error);
  const payload = revByCountry.data;
  const rowsData = payload?.rows ?? [];
  const allPeriodKeys: string[] = payload?.period_keys ?? [];
  if (!Array.isArray(rowsData) || !rowsData.length) return placeholderSection('Revenue por País');
  if (!allPeriodKeys.length) return placeholderSection('Revenue por País', 'period_keys vacío');

  // Tomar últimas 8 semanas (period_keys son fechas de domingo en orden cronológico)
  const periodKeys = allPeriodKeys.slice(-8);

  // Helper: formatear key "2026-03-29" → "29/3 - 4/4"
  const formatWeekLabel = (sundayStr: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sundayStr);
    if (!m) return sundayStr;
    const sunday = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    const saturday = new Date(sunday);
    saturday.setDate(saturday.getDate() + 6);
    return `${sunday.getDate()}/${sunday.getMonth() + 1} - ${saturday.getDate()}/${saturday.getMonth() + 1}`;
  };

  // Helper: normalizar nombre de país (remover mojibake)
  const normCountry = (c: string): string => {
    if (!c) return '';
    if (c.includes('\uFFFD') || c.includes('Ã')) return ''; // mojibake
    return c.trim();
  };

  // Lista fija de países top + Otros
  const TOP_COUNTRIES = ['Perú', 'México', 'Chile'];

  // Buckets
  type Bucket = { weekly: Record<string, number>; total: number };
  const buckets: Record<string, Bucket> = {
    'Perú': { weekly: {}, total: 0 },
    'México': { weekly: {}, total: 0 },
    'Chile': { weekly: {}, total: 0 },
    'Otros': { weekly: {}, total: 0 },
  };
  // Track top país dentro de "Otros" (por total acumulado en las semanas mostradas)
  const otrosBreakdown: Record<string, number> = {};

  for (const r of rowsData) {
    const country = normCountry(r.country || '');
    if (!country) continue;
    const target = TOP_COUNTRIES.includes(country) ? country : 'Otros';
    for (const k of periodKeys) {
      const v = Number(r.periods?.[k] ?? 0);
      if (!Number.isFinite(v)) continue;
      buckets[target].weekly[k] = (buckets[target].weekly[k] || 0) + v;
      buckets[target].total += v;
      if (target === 'Otros') {
        otrosBreakdown[country] = (otrosBreakdown[country] || 0) + v;
      }
    }
  }

  // Construir filas de la tabla en orden Perú/México/Chile/Otros
  const orderedCountries = ['Perú', 'México', 'Chile', 'Otros'];
  const rows: MatrixRow[] = orderedCountries.map((country) => {
    const bucket = buckets[country];
    return {
      label: country,
      cells: [
        ...periodKeys.map((k) => fmtUSD(bucket.weekly[k] ?? 0)),
        fmtUSD(bucket.total),
      ],
    };
  });

  // Fila de totales por semana
  const totalsRow: MatrixRow = {
    label: 'TOTAL',
    bold: true,
    cells: [
      ...periodKeys.map((k) =>
        fmtUSD(orderedCountries.reduce((s, c) => s + (buckets[c].weekly[k] ?? 0), 0)),
      ),
      fmtUSD(orderedCountries.reduce((s, c) => s + buckets[c].total, 0)),
    ],
  };

  // Top 5 países dentro de "Otros"
  const otrosTop = Object.entries(otrosBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const tableHtml = matrix({
    headers: ['País', ...periodKeys.map(formatWeekLabel), 'Total'],
    rows: [...rows, totalsRow],
    compact: true,
  });

  // Caption con el detalle de Otros
  const otrosCaption = otrosTop.length > 0
    ? `<p style="font-size:12px;color:${COLOR.mute};margin:8px 0 0;line-height:1.6;"><strong style="color:${COLOR.neutral};">Dentro de "Otros" (top 5):</strong> ${otrosTop.map(([c, v], i) => `${i + 1}. ${c} <strong style="color:${COLOR.neutral};">${fmtUSD(v)}</strong>`).join(' · ')}</p>`
    : '';

  return section('Revenue por País × Semana (8 semanas)', tableHtml + otrosCaption);
}

function renderChurn(churnRenewal: RpcResult<any>): string {
  if (!churnRenewal.ok) return placeholderSection('Churn Semanal', churnRenewal.error);
  const churnWeeks = churnRenewal.data?.churn_weeks ?? [];
  if (!Array.isArray(churnWeeks) || !churnWeeks.length) return placeholderSection('Churn Semanal');

  const labels = churnWeeks.map((w: any) => w.weekLabel ?? '?');
  const churnRates = churnWeeks.map((w: any) => Number(w.churnRate ?? 0));
  const growthRates = churnWeeks.map((w: any) => Number(w.growthRate ?? 0));

  const chart = combinedBarLineChart({
    title: 'Churn Rate vs Growth Rate Semanal (%)',
    labels,
    bars: { name: 'Churn Rate', data: churnRates, color: CHART_COLORS.rose },
    line: { name: 'Growth Rate', data: growthRates, color: CHART_COLORS.green },
    leftLabel: 'Churn %',
    rightLabel: 'Growth %',
  });

  // Narrativa últimas 3 semanas
  const last3 = churnWeeks.slice(-3);
  const items = last3.map((w: any, i: number) => {
    const isLast = i === last3.length - 1;
    const cr = Number(w.churnRate ?? 0);
    const gr = Number(w.growthRate ?? 0);
    const churnColor = cr <= 2 ? COLOR.green : cr <= 5 ? COLOR.yellow : COLOR.red;
    const growthColor = gr >= 0 ? COLOR.green : COLOR.red;
    const marker = isLast ? ' <span style="color:#9ca3af;">← cerrada</span>' : '';
    return `<strong>${w.weekLabel}</strong>: Starting ${fmtNum(w.startingUsers ?? 0)} → +${fmtNum(w.newPaid ?? 0)} nuevos − ${fmtNum(w.churnedUsers ?? 0)} churn = <strong style="color:${COLOR.neutral};">${fmtNum(w.netUsers ?? 0)} net</strong> · Churn <strong style="color:${churnColor};">${fmtPct(cr)}</strong> · Growth <strong style="color:${growthColor};">${gr >= 0 ? '+' : ''}${fmtPct(gr)}</strong>${marker}`;
  });

  return section('Churn & Growth Semanal', chart + narrativeBlock(items));
}

function renderRenewalNarrative(churnRenewal: RpcResult<any>): string {
  if (!churnRenewal.ok) return placeholderSection('Renovaciones', churnRenewal.error);
  const d = churnRenewal.data;
  const renewal = d?.renewal_weeks ?? [];
  const upcoming = d?.upcoming_renewals ?? [];

  const paragraphs: string[] = [];

  if (Array.isArray(renewal) && renewal.length >= 2) {
    const last = renewal[renewal.length - 1];
    const prev = renewal[renewal.length - 2];
    const lastPct = Number(last?.renewalRate ?? 0);
    const prevPct = Number(prev?.renewalRate ?? 0);
    const lastLabel = last?.weekLabel ?? 'semana pasada';
    const prevLabel = prev?.weekLabel ?? 'antepasada';
    const lastColor = lastPct >= 45 ? COLOR.green : lastPct >= 30 ? COLOR.yellow : COLOR.red;
    const prevColor = prevPct >= 45 ? COLOR.green : prevPct >= 30 ? COLOR.yellow : COLOR.red;
    paragraphs.push(
      `<strong>${prevLabel}</strong> (antepasada): cerramos en <strong style="color:${prevColor};">${fmtPct(prevPct)}</strong> de renovación (${last?.renewed} de ${last?.dueToRenew}).`,
    );
    paragraphs.push(
      `<strong>${lastLabel}</strong> (semana cerrada): cerramos en <strong style="color:${lastColor};">${fmtPct(lastPct)}</strong> (${last?.renewed} de ${last?.dueToRenew}).`,
    );
  }

  if (Array.isArray(upcoming) && upcoming.length) {
    // Distribución por país
    const byCountry: Record<string, number> = {};
    for (const u of upcoming) {
      const c = u?.country || 'Sin país';
      byCountry[c] = (byCountry[c] || 0) + 1;
    }
    const top3 = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, n]) => `${c}: ${n}`)
      .join(', ');

    paragraphs.push(
      `<strong>Próximos 7 días</strong>: toca renovar a <strong style="color:${COLOR.yellow};">${fmtNum(upcoming.length)} personas</strong>. Top: ${top3}.`,
    );
  }

  if (!paragraphs.length) return placeholderSection('Renovaciones');
  return section('Renovaciones — narrativo', narrativeBlock(paragraphs));
}

function renderRenewalTable(churnRenewal: RpcResult<any>): string {
  if (!churnRenewal.ok) return placeholderSection('Tabla Renewal', churnRenewal.error);
  const renewal = churnRenewal.data?.renewal_weeks ?? [];
  if (!Array.isArray(renewal) || !renewal.length) return placeholderSection('Tabla Renewal');

  const rows: MatrixRow[] = renewal.map((w: any, i: number) => {
    const pct = Number(w.renewalRate ?? 0);
    const renewed = Number(w.renewed ?? 0);
    const dueToRenew = Number(w.dueToRenew ?? 0);
    const notRenewed = dueToRenew - renewed;
    const isLast = i === renewal.length - 1;
    return {
      label: w.weekLabel ?? '?',
      bold: isLast,
      cells: [
        fmtNum(renewed),
        fmtNum(notRenewed),
        fmtNum(dueToRenew),
        rawCell(colorCell(pct, THRESHOLDS.renewalPct)),
      ],
    };
  });

  return section('Renewal Rate por Semana', matrix({
    headers: ['Semana', 'Renovaron', 'No renov.', 'Por renovar', '% Renewal'],
    rows,
    compact: true,
  }));
}

function renderConversionFunnel(funnel: RpcResult<any>): string {
  if (!funnel.ok) return placeholderSection('Funnel Conversión', funnel.error);
  const weekly = funnel.data?.weekly ?? [];
  if (!Array.isArray(weekly) || !weekly.length) return placeholderSection('Funnel Conversión');

  const labels = weekly.map((w: any) => w.weekLabel ?? '?');
  const registered = weekly.map((w: any) => Number(w.registered ?? 0));
  const activated = weekly.map((w: any) => Number(w.activated ?? 0));
  const paid = weekly.map((w: any) => Number(w.paid ?? 0));

  const chart = multiLineChart({
    title: 'Funnel Conversión por Cohorte Semanal (counts)',
    labels,
    series: [
      { name: 'Registrados', data: registered, color: CHART_COLORS.blue },
      { name: 'Activados (4+ ev)', data: activated, color: CHART_COLORS.purple },
      { name: 'Pagaron', data: paid, color: CHART_COLORS.green },
    ],
    yAxisLabel: 'Usuarios',
  });

  // Narrativa últimas 3 semanas
  const last3 = weekly.slice(-3);
  const items = last3.map((w: any, i: number) => {
    const isLast = i === last3.length - 1;
    const actPct = Number(w.activationPct ?? 0);
    const convPct = Number(w.conversionPct ?? 0);
    const actColor = actPct >= 60 ? COLOR.green : actPct >= 40 ? COLOR.yellow : COLOR.red;
    const convColor = convPct >= 5 ? COLOR.green : convPct >= 2 ? COLOR.yellow : COLOR.red;
    const marker = isLast ? ' <span style="color:#9ca3af;">← cerrada</span>' : '';
    return `<strong>${w.weekLabel}</strong>: <strong style="color:${COLOR.neutral};">${fmtNum(w.registered ?? 0)} registros</strong> → ${fmtNum(w.activated ?? 0)} activados (<strong style="color:${actColor};">${fmtPct(actPct)}</strong>) → ${fmtNum(w.paid ?? 0)} pagaron (<strong style="color:${convColor};">${fmtPct(convPct)}</strong>)${marker}`;
  });

  return section('Funnel de Conversión Semanal', chart + narrativeBlock(items));
}

// ============================================================================
// Acquisition renderers (NEW - 3 vistas con la RPC get_acquisition_weekly_breakdown)
// ============================================================================

function renderChannelByWeek(acqWeekly: RpcResult<any>): string {
  if (!acqWeekly.ok) return placeholderSection('Canal × Semana', acqWeekly.error);
  const channelWeek = acqWeekly.data?.channel_week ?? [];
  const weeksMeta = acqWeekly.data?.weeks ?? [];
  if (!Array.isArray(channelWeek) || !channelWeek.length || !weeksMeta.length) {
    return placeholderSection('Canal × Semana');
  }

  // Solo últimas 4 semanas
  const last4WeeksMeta = weeksMeta.slice(-4);
  const weekValues: string[] = last4WeeksMeta.map((w: any) => w.value);
  const weekLabels: string[] = last4WeeksMeta.map((w: any) => w.label);

  // Total por semana (para calcular porcentajes)
  const totalsByWeek: Record<string, number> = {};
  for (const wv of weekValues) {
    totalsByWeek[wv] = channelWeek.reduce((s: number, r: any) => s + Number(r.weekly?.[wv] ?? 0), 0);
  }
  const grandTotal = weekValues.reduce((s, wv) => s + (totalsByWeek[wv] ?? 0), 0);

  // Helper: render celda "# (%)"
  const cellNumPct = (n: number, total: number): string => {
    const pct = total > 0 ? (n / total) * 100 : 0;
    return `${fmtNum(n)} <span style="color:${COLOR.mute};font-weight:400;font-size:11px;">(${pct.toFixed(1)}%)</span>`;
  };

  // Filtrar canales que tienen al menos algún registro en las 4 semanas
  const relevantChannels = channelWeek.filter((r: any) =>
    weekValues.some((wv) => Number(r.weekly?.[wv] ?? 0) > 0),
  );

  const rows: MatrixRow[] = relevantChannels.map((row: any) => {
    const channelTotal = weekValues.reduce((s: number, wv: string) => s + Number(row.weekly?.[wv] ?? 0), 0);
    return {
      label: row.channel || '-',
      cells: [
        ...weekValues.map((wv) => {
          const v = Number(row.weekly?.[wv] ?? 0);
          return cellNumPct(v, totalsByWeek[wv] ?? 0);
        }),
        cellNumPct(channelTotal, grandTotal),
      ],
    };
  });

  // Fila de totales por semana
  const totalsRow: MatrixRow = {
    label: 'TOTAL',
    bold: true,
    cells: [
      ...weekValues.map((wv) => fmtNum(totalsByWeek[wv] ?? 0)),
      fmtNum(grandTotal),
    ],
  };

  return section('Canal de Adquisición × Semana (últimas 4)', matrix({
    headers: ['Canal', ...weekLabels, 'Total 4w'],
    rows: [...rows, totalsRow],
    compact: true,
  }));
}

// Helper compartido: render Channel × Country con doble columna # y %
// El % es: canal/total_pais (qué % del total de cada país representa cada canal)
function renderChannelCountryDoubleCol(opts: {
  data: any[];
  title: string;
  caption: string;
}): string {
  const { data, title, caption } = opts;

  // Totales por país (denominador para los porcentajes)
  const totalsByCountry = {
    peru:   data.reduce((s, r) => s + Number(r.peru   ?? 0), 0),
    mexico: data.reduce((s, r) => s + Number(r.mexico ?? 0), 0),
    chile:  data.reduce((s, r) => s + Number(r.chile  ?? 0), 0),
    otros:  data.reduce((s, r) => s + Number(r.otros  ?? 0), 0),
  };
  const grandTotal = totalsByCountry.peru + totalsByCountry.mexico + totalsByCountry.chile + totalsByCountry.otros;

  // Helper: celda de #
  const numCell = (n: number) => fmtNum(n);
  // Helper: celda de % (porcentaje del total de la columna)
  const pctCell = (n: number, total: number): string => {
    if (total <= 0) return '<span style="color:#9ca3af;">—</span>';
    const pct = (n / total) * 100;
    return `<span style="color:${COLOR.mute};">${pct.toFixed(1)}%</span>`;
  };

  const rows: MatrixRow[] = data.map((r: any) => {
    const peru = Number(r.peru ?? 0);
    const mexico = Number(r.mexico ?? 0);
    const chile = Number(r.chile ?? 0);
    const otros = Number(r.otros ?? 0);
    const total = Number(r.total ?? 0);
    return {
      label: r.channel || '-',
      cells: [
        numCell(peru),   pctCell(peru, totalsByCountry.peru),
        numCell(mexico), pctCell(mexico, totalsByCountry.mexico),
        numCell(chile),  pctCell(chile, totalsByCountry.chile),
        numCell(otros),  pctCell(otros, totalsByCountry.otros),
        numCell(total),  pctCell(total, grandTotal),
      ],
    };
  });

  // Fila de totales — los % son siempre 100%
  const totalsRow: MatrixRow = {
    label: 'TOTAL',
    bold: true,
    cells: [
      fmtNum(totalsByCountry.peru),   '100%',
      fmtNum(totalsByCountry.mexico), '100%',
      fmtNum(totalsByCountry.chile),  '100%',
      fmtNum(totalsByCountry.otros),  '100%',
      fmtNum(grandTotal),             '100%',
    ],
  };

  return section(title, matrix({
    headers: ['Canal', 'Perú #', 'Perú %', 'México #', 'México %', 'Chile #', 'Chile %', 'Otros #', 'Otros %', 'Total #', 'Total %'],
    rows: [...rows, totalsRow],
    compact: true,
  }) + caption);
}

function renderChannelByCountryAcumulado(acqWeekly: RpcResult<any>): string {
  if (!acqWeekly.ok) return placeholderSection('Canal × País acumulado', acqWeekly.error);
  const data = acqWeekly.data?.channel_country_acumulado ?? [];
  if (!Array.isArray(data) || !data.length) return placeholderSection('Canal × País acumulado');

  // Caption: top canal por país (en porcentaje)
  const totalsByCountry = {
    peru:   data.reduce((s: number, r: any) => s + Number(r.peru   ?? 0), 0),
    mexico: data.reduce((s: number, r: any) => s + Number(r.mexico ?? 0), 0),
    chile:  data.reduce((s: number, r: any) => s + Number(r.chile  ?? 0), 0),
    otros:  data.reduce((s: number, r: any) => s + Number(r.otros  ?? 0), 0),
  };
  const top = (col: 'peru' | 'mexico' | 'chile' | 'otros') => {
    const sorted = [...data].sort((a, b) => Number(b[col] ?? 0) - Number(a[col] ?? 0));
    const winner = sorted[0];
    if (!winner) return '-';
    const pct = totalsByCountry[col] > 0 ? (Number(winner[col] ?? 0) / totalsByCountry[col]) * 100 : 0;
    return `${winner.channel} (${pct.toFixed(1)}%)`;
  };
  const caption = `<p style="font-size:12px;color:${COLOR.mute};margin:8px 0 0;line-height:1.6;"><strong style="color:${COLOR.neutral};">Top canal por país:</strong> Perú: ${top('peru')} · México: ${top('mexico')} · Chile: ${top('chile')} · Otros: ${top('otros')}</p>`;

  return renderChannelCountryDoubleCol({
    data,
    title: 'Canal × País — Acumulado all-time',
    caption,
  });
}

function renderChannelByCountryLastWeek(acqWeekly: RpcResult<any>): string {
  if (!acqWeekly.ok) return placeholderSection('Canal × País última semana', acqWeekly.error);
  const data = acqWeekly.data?.channel_country_last_week ?? [];
  const lastSunday = acqWeekly.data?.meta?.last_closed_sunday;
  const lastSaturday = acqWeekly.data?.meta?.last_closed_saturday;
  if (!Array.isArray(data) || !data.length) return placeholderSection('Canal × País última semana');

  // Caption: top 3 canales en total (no por país)
  const sortedByTotal = [...data].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
  const grandTotal = sortedByTotal.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const top1 = sortedByTotal[0];
  const top2 = sortedByTotal[1];
  const top3 = sortedByTotal[2];
  const pctOf = (v: number) => grandTotal > 0 ? `${((v / grandTotal) * 100).toFixed(1)}%` : '—';
  const dateRange = lastSunday && lastSaturday
    ? ` (${lastSunday.slice(5)} – ${lastSaturday.slice(5)})`
    : '';
  const caption = `<p style="font-size:12px;color:${COLOR.mute};margin:8px 0 0;line-height:1.6;"><strong style="color:${COLOR.neutral};">Top 3 canales esta semana:</strong> 1. ${top1?.channel ?? '-'} ${fmtNum(Number(top1?.total ?? 0))} (${pctOf(Number(top1?.total ?? 0))}) · 2. ${top2?.channel ?? '-'} ${fmtNum(Number(top2?.total ?? 0))} (${pctOf(Number(top2?.total ?? 0))}) · 3. ${top3?.channel ?? '-'} ${fmtNum(Number(top3?.total ?? 0))} (${pctOf(Number(top3?.total ?? 0))})</p>`;

  return renderChannelCountryDoubleCol({
    data,
    title: `Canal × País — Última semana cerrada${dateRange}`,
    caption,
  });
}

function renderChannelPlan(acq: RpcResult<any>): string {
  if (!acq.ok) return placeholderSection('Canal × Plan', acq.error);
  const channelPlan = acq.data?.channel_plan_table ?? [];
  const planNames: string[] = acq.data?.plan_names ?? [];
  if (!Array.isArray(channelPlan) || !channelPlan.length) return placeholderSection('Canal × Plan');

  // Mostrar solo los planes pagados más relevantes (excluir Gratuito y PruebaTemporal del display)
  const displayPlans = planNames.filter((p) => p !== 'Gratuito' && p !== 'PruebaTemporal');

  const rows: MatrixRow[] = channelPlan.map((r: any) => ({
    label: r.channel || '-',
    cells: [
      ...displayPlans.map((p) => {
        const v = Number(r.plans?.[p] ?? 0);
        return v > 0 ? fmtNum(v) : '—';
      }),
      fmtNum(r.total ?? 0),
    ],
  }));

  return section('Canal × Tipo de Plan (pagados)', matrix({
    headers: ['Canal', ...displayPlans, 'Total'],
    rows,
    compact: true,
  }));
}

function renderCountryRegistrationsTrend(acqWeekly: RpcResult<any>): string {
  if (!acqWeekly.ok) return placeholderSection('Registros por País — Tendencia', acqWeekly.error);
  const countryWeek = acqWeekly.data?.country_week ?? [];
  const weeksMeta = acqWeekly.data?.weeks ?? [];
  if (!Array.isArray(countryWeek) || !countryWeek.length || !weeksMeta.length) {
    return placeholderSection('Registros por País — Tendencia');
  }

  const weekValues: string[] = weeksMeta.map((w: any) => w.value);
  const weekLabels: string[] = weeksMeta.map((w: any) => w.label);

  // Mapear a series para multiLineChart — orden: Perú, México, Chile, Otros
  const orderedCountries = ['Perú', 'México', 'Chile', 'Otros'];
  const countryColors: Record<string, string> = {
    'Perú': CHART_COLORS.primary,   // rojo Califica (mercado principal)
    'México': CHART_COLORS.blue,
    'Chile': CHART_COLORS.green,
    'Otros': CHART_COLORS.gray,
  };

  const series = orderedCountries.map((country) => {
    const row = countryWeek.find((c: any) => c.country === country);
    return {
      name: country,
      data: weekValues.map((wv) => Number(row?.weekly?.[wv] ?? 0)),
      color: countryColors[country],
    };
  });

  const chart = multiLineChart({
    title: 'Registros por País × Semana (8 semanas)',
    labels: weekLabels,
    series,
    yAxisLabel: 'Registros',
  });

  // Narrativa: últimas 3 semanas con cifras concretas
  const last3Weeks = weekValues.slice(-3);
  const last3Labels = weekLabels.slice(-3);
  const items = last3Weeks.map((wv, i) => {
    const isLast = i === last3Weeks.length - 1;
    const peru = orderedCountries[0] && Number(countryWeek.find((c: any) => c.country === 'Perú')?.weekly?.[wv] ?? 0);
    const mex = Number(countryWeek.find((c: any) => c.country === 'México')?.weekly?.[wv] ?? 0);
    const chi = Number(countryWeek.find((c: any) => c.country === 'Chile')?.weekly?.[wv] ?? 0);
    const otr = Number(countryWeek.find((c: any) => c.country === 'Otros')?.weekly?.[wv] ?? 0);
    const total = (peru || 0) + mex + chi + otr;
    const marker = isLast ? ' <span style="color:#9ca3af;">← cerrada</span>' : '';
    return `<strong>${last3Labels[i]}</strong>: <strong style="color:${COLOR.neutral};">${fmtNum(total)} reg</strong> · Perú <strong style="color:${CHART_COLORS.primary};">${fmtNum(peru || 0)}</strong> · México <strong style="color:${CHART_COLORS.blue};">${fmtNum(mex)}</strong> · Chile <strong style="color:${CHART_COLORS.green};">${fmtNum(chi)}</strong> · Otros <strong style="color:${CHART_COLORS.gray};">${fmtNum(otr)}</strong>${marker}`;
  });

  return section('Registros por País — Tendencia', chart + narrativeBlock(items));
}

// ============================================================================
// Main handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  try {
    // Parse body
    let body: {
      preview?: boolean;
      test?: boolean;
      to?: string;
      force?: boolean;
      week_start_override?: string;
    } = {};
    try {
      body = await req.clone().json();
    } catch { /* no body */ }

    const { preview = false, test = false, to = '', force = false, week_start_override } = body;

    // Auth: preview/test aceptan Bearer token normal; envío real requiere CRON_SECRET
    const isCronInvocation = !preview && !test;
    if (isCronInvocation) {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const url = new URL(req.url);
      const querySecret = url.searchParams.get('secret') || '';
      const headerSecret = req.headers.get('x-cron-secret') || '';
      if (cronSecret && headerSecret !== cronSecret && querySecret !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
      }
    }

    // Supabase client (service role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resend client
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey && !preview) {
      throw new Error('RESEND_API_KEY not configured');
    }
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // -------------------------------------------------------------------------
    // Calcular semana objetivo
    //   - Por defecto: última semana cerrada (Dom-Sáb hora Lima)
    //   - Si viene week_start_override: usar esa fecha (debe ser domingo)
    // -------------------------------------------------------------------------
    let lastClosedSunday: Date;
    if (week_start_override) {
      // Validar formato YYYY-MM-DD y que sea domingo
      const overrideMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(week_start_override);
      if (!overrideMatch) {
        return new Response(
          JSON.stringify({ error: 'week_start_override must be YYYY-MM-DD format' }),
          { status: 400, headers: JSON_HEADERS },
        );
      }
      const [, y, m, d] = overrideMatch;
      lastClosedSunday = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (lastClosedSunday.getDay() !== 0) {
        return new Response(
          JSON.stringify({ error: 'week_start_override must be a Sunday (day-of-week 0)' }),
          { status: 400, headers: JSON_HEADERS },
        );
      }
    } else {
      const now = new Date();
      const todaySundayLima = getLimaSunday(now);
      lastClosedSunday = addDays(todaySundayLima, -7);
    }
    const lastClosedSaturday = addDays(lastClosedSunday, 6);
    const weekStartStr = toDateStr(lastClosedSunday);
    const weekEndStr = toDateStr(lastClosedSaturday);
    const weekLabel = `${fmtDateEs(lastClosedSunday)} — ${fmtDateEs(lastClosedSaturday)}, ${lastClosedSaturday.getFullYear()}`;

    // -------------------------------------------------------------------------
    // Idempotency guard (envío real, sin force)
    // -------------------------------------------------------------------------
    if (isCronInvocation && !force) {
      const { data: existing } = await supabaseAdmin
        .from('growth_report_log')
        .select('status, sent_at')
        .eq('week_start', weekStartStr)
        .in('status', ['sent', 'partial'])
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({
            message: 'Already sent for this week',
            week_start: weekStartStr,
            existing_status: existing.status,
            existing_sent_at: existing.sent_at,
            hint: 'Use { force: true } to resend',
          }),
          { status: 200, headers: JSON_HEADERS },
        );
      }
    }

    // -------------------------------------------------------------------------
    // Fetch paralelo de RPCs (Promise.allSettled con timeout por RPC)
    // -------------------------------------------------------------------------
    const currentYear = lastClosedSaturday.getFullYear();
    const [
      execSummary,
      yoyMatrix,
      revByCountry,
      churnRenewal,
      convFunnel,
      acqWeeklyBreakdown,
    ] = await Promise.all([
      callRpc(supabaseAdmin, 'get_executive_summary', { p_week_start: weekStartStr }),
      callRpc(supabaseAdmin, 'get_yoy_revenue_matrix', { p_week_start: weekStartStr }),
      callRpc(supabaseAdmin, 'get_revenue_by_country', {
        p_year: currentYear,
        p_granularity: 'weekly',
        p_prev_year_yoy: false,
      }),
      callRpc(supabaseAdmin, 'get_churn_renewal', {
        p_week_start: weekStartStr,
        p_weeks: 8,
        p_plan_filter: 'all',
        p_upcoming_days: 7,
      }),
      callRpc(supabaseAdmin, 'get_conversion_funnel', {
        p_week_start: weekStartStr,
        p_weeks: 8,
        p_eventos_filter: 'all',
        p_plan_status: 'all',
        p_plan_id: 'all',
      }),
      callRpc(supabaseAdmin, 'get_acquisition_weekly_breakdown', {
        p_weeks: 8,
      }, 30000), // 30s timeout — agrega sobre todo growth_users
    ]);

    // -------------------------------------------------------------------------
    // Ensamblar HTML
    // -------------------------------------------------------------------------
    const bodyHtml = [
      renderHeadline(execSummary, churnRenewal, yoyMatrix),
      renderVentasSemanales(execSummary),
      renderRevenueYoyWeekly(yoyMatrix),
      renderRevenueYoyDaily(yoyMatrix),
      renderRevenueByCountry(revByCountry),
      renderChurn(churnRenewal),
      renderRenewalNarrative(churnRenewal),
      renderRenewalTable(churnRenewal),
      renderConversionFunnel(convFunnel),
      renderCountryRegistrationsTrend(acqWeeklyBreakdown),
      renderChannelByWeek(acqWeeklyBreakdown),
      renderChannelByCountryAcumulado(acqWeeklyBreakdown),
      renderChannelByCountryLastWeek(acqWeeklyBreakdown),
    ].join('\n');

    const html = emailShell({
      title: 'Growth Report',
      subtitle: `Semana ${weekLabel}`,
      bodyHtml,
    });

    // Collect RPC failures for diagnostics
    const rpcStatus = {
      executive_summary: execSummary.ok,
      yoy_revenue_matrix: yoyMatrix.ok,
      revenue_by_country: revByCountry.ok,
      churn_renewal: churnRenewal.ok,
      conversion_funnel: convFunnel.ok,
      acquisition_weekly_breakdown: acqWeeklyBreakdown.ok,
    };
    const failedRpcs = Object.entries(rpcStatus).filter(([, ok]) => !ok).map(([k]) => k);
    const rpcErrors = {
      executive_summary: execSummary.ok ? null : execSummary.error,
      yoy_revenue_matrix: yoyMatrix.ok ? null : yoyMatrix.error,
      revenue_by_country: revByCountry.ok ? null : revByCountry.error,
      churn_renewal: churnRenewal.ok ? null : churnRenewal.error,
      conversion_funnel: convFunnel.ok ? null : convFunnel.error,
      acquisition_weekly_breakdown: acqWeeklyBreakdown.ok ? null : acqWeeklyBreakdown.error,
    };

    // -------------------------------------------------------------------------
    // Preview mode: retorna HTML sin enviar
    // -------------------------------------------------------------------------
    if (preview) {
      return new Response(
        JSON.stringify({
          html,
          week_label: weekLabel,
          week_start: weekStartStr,
          html_size_kb: Math.round((html.length / 1024) * 10) / 10,
          rpc_status: rpcStatus,
          rpc_errors: rpcErrors,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    // -------------------------------------------------------------------------
    // Determinar recipients
    // -------------------------------------------------------------------------
    let recipients: { recipient_email: string; recipient_name?: string }[] = [];
    if (test) {
      if (!to || !to.includes('@')) {
        return new Response(
          JSON.stringify({ error: 'test mode requires body.to = "email@domain.com"' }),
          { status: 400, headers: JSON_HEADERS },
        );
      }
      recipients = [{ recipient_email: to, recipient_name: 'Test' }];
    } else {
      const { data: recs, error: recError } = await supabaseAdmin
        .from('growth_report_config')
        .select('recipient_email, recipient_name')
        .eq('is_active', true);
      if (recError) throw recError;
      if (!recs || recs.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No active recipients in growth_report_config' }),
          { status: 400, headers: JSON_HEADERS },
        );
      }
      recipients = recs;
    }

    // -------------------------------------------------------------------------
    // Enviar via Resend
    // -------------------------------------------------------------------------
    if (!resend) throw new Error('Resend not initialized');
    const emailResults = await Promise.allSettled(
      recipients.map((r) =>
        resend.emails.send({
          from: FROM_EMAIL,
          to: r.recipient_email,
          subject: `Growth Report — Semana ${weekLabel}`,
          html,
        })
      ),
    );
    const successCount = emailResults.filter((r) => r.status === 'fulfilled').length;
    const failCount = emailResults.filter((r) => r.status === 'rejected').length;
    const sendErrors = emailResults
      .filter((r) => r.status === 'rejected')
      .map((r: any) => r.reason?.message || String(r.reason))
      .join('; ');

    // -------------------------------------------------------------------------
    // Log + snapshot (no para test mode)
    // -------------------------------------------------------------------------
    const finalStatus = test ? 'test' : failCount === 0 ? 'sent' : failCount === recipients.length ? 'error' : 'partial';
    const logError = [
      failedRpcs.length ? `RPC failures: ${failedRpcs.join(',')}` : null,
      sendErrors ? `Send errors: ${sendErrors}` : null,
    ].filter(Boolean).join(' | ') || null;

    await supabaseAdmin.from('growth_report_log').insert({
      week_start: weekStartStr,
      sent_at: new Date().toISOString(),
      recipients_count: successCount,
      status: finalStatus,
      error_message: logError,
    });

    if (!test) {
      // Upsert weekly snapshot — extraer métricas del execSummary si disponible
      const execData = execSummary.ok ? execSummary.data : null;
      if (execData) {
        const snapshot: Record<string, unknown> = {
          week_start: weekStartStr,
          week_end: weekEndStr,
          computed_at: new Date().toISOString(),
        };
        // Copy whatever fields we have, mapping to snapshot columns if names match
        const last = execData?.weekly_trend?.slice(-1)?.[0];
        if (last) {
          snapshot.revenue_new = Number(last.revenue_new ?? 0);
          snapshot.revenue_recurring = Number(last.revenue_renewal ?? 0);
          snapshot.revenue_total = Number(last.revenue_new ?? 0) + Number(last.revenue_renewal ?? 0);
          if (last.registrations !== undefined) snapshot.new_users = Number(last.registrations);
        }
        if (yoyMatrix.ok) {
          const lastYoy = yoyMatrix.data?.weekly?.slice(-1)?.[0];
          if (lastYoy?.growthPct !== undefined) snapshot.revenue_growth_yoy = Number(lastYoy.growthPct);
        }
        await supabaseAdmin.from('growth_weekly_snapshots').upsert(snapshot, { onConflict: 'week_start' });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'OK',
        week_label: weekLabel,
        week_start: weekStartStr,
        recipients_count: successCount,
        failed: failCount,
        status: finalStatus,
        html_size_kb: Math.round((html.length / 1024) * 10) / 10,
        rpc_status: rpcStatus,
        failed_rpcs: failedRpcs,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const errMsg = (error as Error).message;
    try {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await supabaseAdmin.from('growth_report_log').insert({
        week_start: new Date().toISOString().split('T')[0],
        sent_at: new Date().toISOString(),
        recipients_count: 0,
        status: 'error',
        error_message: errMsg,
      });
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
