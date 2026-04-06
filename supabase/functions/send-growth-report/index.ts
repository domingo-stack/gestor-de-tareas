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
  const periodKeys: string[] = payload?.period_keys ?? [];
  if (!Array.isArray(rowsData) || !rowsData.length) return placeholderSection('Revenue por País');
  if (!periodKeys.length) return placeholderSection('Revenue por País', 'period_keys vacío');

  // Top 10 países por total
  const sorted = [...rowsData]
    .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
    .slice(0, 10);

  const rows: MatrixRow[] = sorted.map((r: any) => ({
    label: r.country || '-',
    cells: [
      ...periodKeys.map((k) => {
        // Si el periodo no existe en periods → null (no había data)
        // Si existe pero es 0 → mostrar $0
        const raw = r.periods?.[k];
        if (raw === undefined || raw === null) return '—';
        return fmtUSD(Number(raw));
      }),
      fmtUSD(Number(r.total ?? 0)),
    ],
  }));

  // Fila de totales
  const totalsRow: MatrixRow = {
    label: 'TOTAL',
    bold: true,
    cells: [
      ...periodKeys.map((k) => fmtUSD(Number(payload?.totals?.[k] ?? 0))),
      fmtUSD(periodKeys.reduce((s, k) => s + Number(payload?.totals?.[k] ?? 0), 0)),
    ],
  };

  return section(`Revenue por País × Mes (top 10, ${payload.year ?? 'año actual'})`, matrix({
    headers: ['País', ...periodKeys, 'Total'],
    rows: [...rows, totalsRow],
    compact: true,
  }));
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

function renderAcquisitionCountry(acq: RpcResult<any>): string {
  if (!acq.ok) return placeholderSection('País × Status', acq.error);
  const table = acq.data?.country_table ?? [];
  if (!Array.isArray(table) || !table.length) return placeholderSection('País × Status');

  // Filtrar mojibake (Per�� y similares) y top 10 por total
  const clean = table.filter((r: any) => r.key && !r.key.includes('\uFFFD') && !r.key.includes('Ã'));
  const top = [...clean]
    .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
    .slice(0, 10);

  const rows: MatrixRow[] = top.map((r: any) => {
    const convPct = Number(r.conversionPct ?? 0);
    return {
      label: r.key || '-',
      cells: [
        fmtNum(r.gratisActivado ?? 0),
        fmtNum(r.noActivado ?? 0),
        fmtNum(r.pago ?? 0),
        fmtNum(r.total ?? 0),
        fmtPct(Number(r.pctOfGrandTotal ?? 0)),
        rawCell(colorCell(convPct, THRESHOLDS.conversionPct)),
      ],
    };
  });

  return section('País × Status (top 10 acumulado)', matrix({
    headers: ['País', 'Gratis activ.', 'No activ.', 'Pago', 'Total', '% del total', '% Conv.'],
    rows,
    compact: true,
  }));
}

function renderAcquisitionChannel(acq: RpcResult<any>): string {
  if (!acq.ok) return placeholderSection('Canal de Adquisición', acq.error);
  const channelTable = acq.data?.channel_table ?? [];
  if (!Array.isArray(channelTable) || !channelTable.length) return placeholderSection('Canal de Adquisición');

  const rows: MatrixRow[] = channelTable.map((r: any) => {
    const convPct = Number(r.conversionPct ?? 0);
    return {
      label: r.key || '-',
      cells: [
        fmtNum(r.gratisActivado ?? 0),
        fmtNum(r.noActivado ?? 0),
        fmtNum(r.pago ?? 0),
        fmtNum(r.total ?? 0),
        fmtPct(Number(r.pctOfGrandTotal ?? 0)),
        rawCell(colorCell(convPct, THRESHOLDS.conversionPct)),
      ],
    };
  });

  return section('Canal de Adquisición × Status (acumulado)', matrix({
    headers: ['Canal', 'Gratis activ.', 'No activ.', 'Pago', 'Total', '% del total', '% Conv.'],
    rows,
    compact: true,
  }));
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

function renderCountryRegistrations(execSummary: RpcResult<any>): string {
  if (!execSummary.ok) return placeholderSection('Registros por País (semana)', execSummary.error);
  const cr = execSummary.data?.country_registrations ?? [];
  if (!Array.isArray(cr) || !cr.length) return placeholderSection('Registros por País (semana)');

  // Top 10
  const top = [...cr]
    .filter((r: any) => r.country && !r.country.includes('\uFFFD') && !r.country.includes('Ã'))
    .sort((a, b) => Number(b.registrations ?? 0) - Number(a.registrations ?? 0))
    .slice(0, 10);

  const rows: MatrixRow[] = top.map((r: any) => {
    const convPct = Number(r.conversion_pct ?? 0);
    return {
      label: r.country || '-',
      cells: [
        fmtNum(r.registrations ?? 0),
        fmtNum(r.paid ?? 0),
        rawCell(colorCell(convPct, THRESHOLDS.conversionPct)),
      ],
    };
  });

  return section('Registros por País — semana cerrada (top 10)', matrix({
    headers: ['País', 'Registros', 'Pagaron', '% Conv.'],
    rows,
    compact: true,
  }));
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
      acqStats,
    ] = await Promise.all([
      callRpc(supabaseAdmin, 'get_executive_summary', { p_week_start: weekStartStr }),
      callRpc(supabaseAdmin, 'get_yoy_revenue_matrix', { p_week_start: weekStartStr }),
      callRpc(supabaseAdmin, 'get_revenue_by_country', {
        p_year: currentYear,
        p_granularity: 'monthly',
        p_prev_year_yoy: true,
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
      callRpc(supabaseAdmin, 'get_acquisition_stats', {
        p_week_start: null,
        p_country_filter: null,
      }, 30000), // 30s timeout — esta RPC agrega sobre 367k usuarios all-time
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
      renderCountryRegistrations(execSummary),
      renderAcquisitionCountry(acqStats),
      renderAcquisitionChannel(acqStats),
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
      acquisition_stats: acqStats.ok,
    };
    const failedRpcs = Object.entries(rpcStatus).filter(([, ok]) => !ok).map(([k]) => k);
    const rpcErrors = {
      executive_summary: execSummary.ok ? null : execSummary.error,
      yoy_revenue_matrix: yoyMatrix.ok ? null : yoyMatrix.error,
      revenue_by_country: revByCountry.ok ? null : revByCountry.error,
      churn_renewal: churnRenewal.ok ? null : churnRenewal.error,
      conversion_funnel: convFunnel.ok ? null : convFunnel.error,
      acquisition_stats: acqStats.ok ? null : acqStats.error,
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
