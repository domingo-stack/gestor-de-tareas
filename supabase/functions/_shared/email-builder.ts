// ============================================================================
// Email Builder — helpers puros para construir HTML de emails
// ============================================================================
// Usado por send-growth-report. Funciones puras, sin dependencias externas,
// sin side effects. Todo el styling es inline porque los clientes de email
// (Gmail, Outlook) no soportan CSS externo confiablemente.
//
// Convenciones de diseño:
//   - Colores semánticos: verde (positivo), amarillo (atención), rojo (alerta)
//   - Brand Califica: #3c527a (azul) + #ff8080 (rojo suave) para header
//   - Background: #f3f4f6, cards blancas con rounded corners
//   - Tipografía system font stack para máxima compatibilidad
// ============================================================================

import { escapeHtml } from './escapeHtml.ts';

// ============================================================================
// Formatters
// ============================================================================

/**
 * Formatters: explícitamente distinguen entre 0 (mostrar como "0") y
 * null/undefined (mostrar como "—"). Esto evita el problema de que valores
 * cero aparezcan como em-dashes y confundan al lector.
 */

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
}

export function fmtUSD(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(decimals)}%`;
}

// ============================================================================
// Color logic
// ============================================================================

export type Threshold = {
  /** Value at or above this = green (if direction='up') or red (if direction='down') */
  green: number;
  /** Value at or above this = yellow (if direction='up') or red boundary (if direction='down') */
  yellow: number;
  /** 'up' = higher is better (revenue, conversion); 'down' = lower is better (churn) */
  direction: 'up' | 'down';
};

export const COLOR = {
  green: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
  neutral: '#111827',
  mute: '#6b7280',
  border: '#e5e7eb',
  headerBg: '#f9fafb',
  rowAlt: '#f9fafb',
} as const;

export function pickColor(value: number | null | undefined, t: Threshold): string {
  if (value === null || value === undefined || Number.isNaN(value)) return COLOR.mute;
  if (t.direction === 'up') {
    if (value >= t.green) return COLOR.green;
    if (value >= t.yellow) return COLOR.yellow;
    return COLOR.red;
  } else {
    if (value <= t.green) return COLOR.green;
    if (value <= t.yellow) return COLOR.yellow;
    return COLOR.red;
  }
}

// Thresholds pre-definidos por métrica (del design doc)
export const THRESHOLDS = {
  revenueWoW: { green: 5, yellow: -5, direction: 'up' as const },
  revenueYoY: { green: 20, yellow: 0, direction: 'up' as const },
  churnRate: { green: 2, yellow: 5, direction: 'down' as const },
  renewalPct: { green: 45, yellow: 30, direction: 'up' as const },
  conversionPct: { green: 5, yellow: 2, direction: 'up' as const },
  activationPct: { green: 60, yellow: 40, direction: 'up' as const },
  retentionD7: { green: 50, yellow: 30, direction: 'up' as const },
};

// ============================================================================
// Small renderers
// ============================================================================

/** Flecha con color según delta positivo/negativo */
export function arrow(delta: number | null | undefined, decimals = 1): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '';
  const abs = Math.abs(delta).toFixed(decimals);
  if (delta >= 0) {
    return `<span style="color:${COLOR.green};font-weight:600;">▲ ${abs}%</span>`;
  }
  return `<span style="color:${COLOR.red};font-weight:600;">▼ ${abs}%</span>`;
}

/** Celda de tabla con color de fondo según threshold */
export function colorCell(
  value: number | null | undefined,
  threshold: Threshold,
  formatter: (v: number) => string = fmtPct,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return `<td style="padding:6px 10px;text-align:right;color:${COLOR.mute};">—</td>`;
  }
  const color = pickColor(value, threshold);
  // Fondo suave del mismo tono
  const bg = color === COLOR.green ? '#ecfdf5' : color === COLOR.yellow ? '#fffbeb' : color === COLOR.red ? '#fef2f2' : '#f9fafb';
  return `<td style="padding:6px 10px;text-align:right;color:${color};background-color:${bg};font-weight:600;">${formatter(value)}</td>`;
}

// ============================================================================
// Section structures
// ============================================================================

export function emailShell(opts: {
  title: string;
  subtitle: string;
  bodyHtml: string;
  footerLink?: string;
}): string {
  const { title, subtitle, bodyHtml, footerLink = 'https://califica.ai/revenue' } = opts;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOR.neutral};">
<div style="max-width:760px;margin:0 auto;padding:24px 16px;">

  <div style="background:linear-gradient(135deg,#3c527a,#ff8080);border-radius:12px 12px 0 0;padding:28px 24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(title)}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">${escapeHtml(subtitle)}</p>
  </div>

  <div style="background:#ffffff;padding:24px 20px;border-radius:0 0 12px 12px;border:1px solid ${COLOR.border};border-top:0;">
    ${bodyHtml}

    <div style="text-align:center;padding-top:20px;margin-top:24px;border-top:1px solid ${COLOR.border};">
      <p style="color:${COLOR.mute};font-size:11px;margin:0 0 6px;">
        Generado automáticamente por Califica Growth Dashboard
      </p>
      <a href="${escapeHtml(footerLink)}" style="color:#3c527a;font-size:11px;text-decoration:none;">
        Ver dashboard completo →
      </a>
    </div>
  </div>

</div>
</body>
</html>`;
}

export function section(title: string, bodyHtml: string): string {
  return `
<div style="margin-top:28px;">
  <h2 style="color:${COLOR.neutral};font-size:15px;font-weight:700;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid ${COLOR.border};text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(title)}</h2>
  ${bodyHtml}
</div>`;
}

export function placeholderSection(title: string, reason?: string): string {
  const msg = reason
    ? `Datos no disponibles para esta sección.`
    : `Datos no disponibles para esta sección.`;
  return section(title, `
<div style="padding:16px;background-color:#f9fafb;border:1px dashed ${COLOR.border};border-radius:6px;text-align:center;">
  <p style="color:${COLOR.mute};font-size:13px;margin:0;font-style:italic;">${escapeHtml(msg)}</p>
</div>`);
}

// ============================================================================
// KPI blocks
// ============================================================================

export type KpiRow = {
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
  deltaWoW?: number | null;
  deltaYoY?: number | null;
};

export function kpiTable(rows: KpiRow[]): string {
  const trHtml = rows.map((r) => {
    const valueColor = r.color ?? COLOR.neutral;
    const deltas: string[] = [];
    if (r.deltaWoW !== undefined && r.deltaWoW !== null) {
      deltas.push(`<span style="font-size:11px;color:${COLOR.mute};margin-right:6px;">WoW</span>${arrow(r.deltaWoW)}`);
    }
    if (r.deltaYoY !== undefined && r.deltaYoY !== null) {
      deltas.push(`<span style="font-size:11px;color:${COLOR.mute};margin-right:6px;margin-left:10px;">YoY</span>${arrow(r.deltaYoY)}`);
    }
    const deltaHtml = deltas.length ? `<div style="margin-top:2px;font-size:12px;">${deltas.join('')}</div>` : '';
    const sublabelHtml = r.sublabel ? `<div style="font-size:11px;color:${COLOR.mute};margin-top:2px;">${escapeHtml(r.sublabel)}</div>` : '';
    return `
<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${COLOR.border};">
    <div style="font-size:13px;color:${COLOR.mute};">${escapeHtml(r.label)}</div>
    ${sublabelHtml}
  </td>
  <td style="padding:10px 0;border-bottom:1px solid ${COLOR.border};text-align:right;">
    <div style="font-size:16px;font-weight:700;color:${valueColor};">${r.value}</div>
    ${deltaHtml}
  </td>
</tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;">${trHtml}</table>`;
}

// ============================================================================
// Data matrix table
// ============================================================================

export type MatrixCell = string | { html: string };

export type MatrixRow = {
  label: string;
  cells: MatrixCell[];
  bold?: boolean;
};

export function matrix(opts: {
  headers: string[];
  rows: MatrixRow[];
  firstColWidth?: string;
  compact?: boolean;
}): string {
  const { headers, rows, firstColWidth = 'auto', compact = false } = opts;
  const cellPadding = compact ? '4px 8px' : '8px 10px';
  const headerCellPadding = compact ? '6px 8px' : '10px 10px';

  const headerHtml = `
<thead>
  <tr style="background-color:${COLOR.headerBg};">
    <th style="padding:${headerCellPadding};text-align:left;font-size:11px;font-weight:600;color:${COLOR.mute};text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid ${COLOR.border};width:${firstColWidth};">${escapeHtml(headers[0] || '')}</th>
    ${headers.slice(1).map((h) => `<th style="padding:${headerCellPadding};text-align:right;font-size:11px;font-weight:600;color:${COLOR.mute};text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid ${COLOR.border};">${escapeHtml(h)}</th>`).join('')}
  </tr>
</thead>`;

  const bodyHtml = `
<tbody>
  ${rows.map((r, i) => {
    const bg = i % 2 === 1 ? COLOR.rowAlt : '#ffffff';
    const weight = r.bold ? '700' : '500';
    const cellsHtml = r.cells.map((c) => {
      if (typeof c === 'string') {
        return `<td style="padding:${cellPadding};text-align:right;font-size:13px;color:${COLOR.neutral};font-weight:${weight};">${c}</td>`;
      }
      return c.html; // pre-rendered cell (e.g. from colorCell)
    }).join('');
    return `
<tr style="background-color:${bg};">
  <td style="padding:${cellPadding};text-align:left;font-size:13px;color:${COLOR.neutral};font-weight:${r.bold ? '700' : '600'};">${escapeHtml(r.label)}</td>
  ${cellsHtml}
</tr>`;
  }).join('')}
</tbody>`;

  return `<table style="width:100%;border-collapse:collapse;border:1px solid ${COLOR.border};border-radius:6px;overflow:hidden;">${headerHtml}${bodyHtml}</table>`;
}

// Helper para generar celda raw HTML (para pasar a matrix como MatrixCell)
export function rawCell(html: string): MatrixCell {
  return { html };
}

// ============================================================================
// Charts via QuickChart.io
// ============================================================================
// QuickChart renderiza Chart.js configs como imágenes PNG via URL.
// Esto funciona en Gmail/Outlook/Apple Mail porque es solo un <img src=...>.
// Docs: https://quickchart.io/documentation/
//
// Color palette para series múltiples (años, categorías, etc.)
export const CHART_COLORS = {
  gray:    '#94a3b8', // 2023
  blue:    '#3b82f6', // 2024
  green:   '#10b981', // 2025
  primary: '#ff8080', // 2026 (Califica brand)
  amber:   '#f59e0b',
  purple:  '#a855f7',
  cyan:    '#06b6d4',
  rose:    '#f43f5e',
} as const;

/**
 * Genera un <img> con un chart de QuickChart.
 * El config es un Chart.js v3 config object.
 */
export function chartImage(
  config: Record<string, unknown>,
  opts: { width?: number; height?: number; alt?: string; bgColor?: string } = {},
): string {
  const { width = 600, height = 280, alt = 'chart', bgColor = 'white' } = opts;
  // QuickChart soporta JSON pasado como query param
  const json = JSON.stringify(config);
  const url = `https://quickchart.io/chart?w=${width}&h=${height}&bkg=${bgColor}&v=4&c=${encodeURIComponent(json)}`;
  return `<div style="margin:8px 0;text-align:center;">
  <img src="${url}" width="${width}" alt="${escapeHtml(alt)}" style="display:inline-block;max-width:100%;height:auto;border:1px solid ${COLOR.border};border-radius:6px;" />
</div>`;
}

/**
 * Helper para construir un line chart YoY (4 años de comparación).
 * Datos: array de filas con { label, y2023, y2024, y2025, y2026 }
 */
export function lineChartYoY(opts: {
  title: string;
  rows: Array<{ label: string; y2023?: number; y2024?: number; y2025?: number; y2026?: number }>;
  yAxisLabel?: string;
}): string {
  const labels = opts.rows.map((r) => r.label);
  const datasets = [
    {
      label: '2023',
      data: opts.rows.map((r) => r.y2023 ?? null),
      borderColor: CHART_COLORS.gray,
      backgroundColor: CHART_COLORS.gray,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: '2024',
      data: opts.rows.map((r) => r.y2024 ?? null),
      borderColor: CHART_COLORS.blue,
      backgroundColor: CHART_COLORS.blue,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: '2025',
      data: opts.rows.map((r) => r.y2025 ?? null),
      borderColor: CHART_COLORS.green,
      backgroundColor: CHART_COLORS.green,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: '2026',
      data: opts.rows.map((r) => r.y2026 ?? null),
      borderColor: CHART_COLORS.primary,
      backgroundColor: CHART_COLORS.primary,
      borderWidth: 3,
      pointRadius: 3,
      tension: 0.3,
      spanGaps: true,
    },
  ];

  const config = {
    type: 'line',
    data: { labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: opts.title, font: { size: 14, weight: 'bold' } },
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: !!opts.yAxisLabel, text: opts.yAxisLabel ?? '' },
          ticks: { font: { size: 10 } },
        },
        x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } },
      },
    },
  };

  return chartImage(config, { width: 720, height: 340, alt: opts.title });
}

/**
 * Stacked bar chart con 2 series.
 * Útil para "Nuevo vs Recurrente" tipo distribución.
 */
export function stackedBarChart(opts: {
  title: string;
  labels: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
  yAxisLabel?: string;
}): string {
  const datasets = opts.series.map((s) => ({
    label: s.name,
    data: s.data,
    backgroundColor: s.color,
    borderColor: s.color,
    borderWidth: 0,
    stack: 'stack1',
  }));

  const config = {
    type: 'bar',
    data: { labels: opts.labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: opts.title, font: { size: 14, weight: 'bold' } },
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: !!opts.yAxisLabel, text: opts.yAxisLabel ?? '' },
          ticks: { font: { size: 10 } },
        },
        x: {
          stacked: true,
          ticks: { font: { size: 10 } },
        },
      },
    },
  };

  return chartImage(config, { width: 720, height: 320, alt: opts.title });
}

/**
 * Combined chart: barras en eje izquierdo + línea en eje derecho.
 * Útil para "Churn Rate (bars) + Growth Rate (line)" o similar.
 */
export function combinedBarLineChart(opts: {
  title: string;
  labels: string[];
  bars: { name: string; data: number[]; color: string };
  line: { name: string; data: number[]; color: string };
  leftLabel?: string;
  rightLabel?: string;
}): string {
  const config = {
    type: 'bar',
    data: {
      labels: opts.labels,
      datasets: [
        {
          type: 'bar',
          label: opts.bars.name,
          data: opts.bars.data,
          backgroundColor: opts.bars.color,
          borderColor: opts.bars.color,
          borderWidth: 0,
          yAxisID: 'yLeft',
          order: 2,
        },
        {
          type: 'line',
          label: opts.line.name,
          data: opts.line.data,
          borderColor: opts.line.color,
          backgroundColor: opts.line.color,
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'yRight',
          order: 1,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: opts.title, font: { size: 14, weight: 'bold' } },
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
      },
      scales: {
        yLeft: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: !!opts.leftLabel, text: opts.leftLabel ?? '' },
          ticks: { font: { size: 10 } },
        },
        yRight: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          title: { display: !!opts.rightLabel, text: opts.rightLabel ?? '' },
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 10 } },
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  };

  return chartImage(config, { width: 720, height: 320, alt: opts.title });
}

/**
 * Multi-line chart: N líneas con colores específicos.
 * Útil para funnel de conversión (Registros / Activados / Pagados por semana).
 */
export function multiLineChart(opts: {
  title: string;
  labels: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
  yAxisLabel?: string;
}): string {
  const datasets = opts.series.map((s) => ({
    label: s.name,
    data: s.data,
    borderColor: s.color,
    backgroundColor: s.color,
    borderWidth: 2,
    pointRadius: 3,
    tension: 0.3,
  }));

  const config = {
    type: 'line',
    data: { labels: opts.labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: opts.title, font: { size: 14, weight: 'bold' } },
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: !!opts.yAxisLabel, text: opts.yAxisLabel ?? '' },
          ticks: { font: { size: 10 } },
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  };

  return chartImage(config, { width: 720, height: 320, alt: opts.title });
}

// ============================================================================
// Narrative block (texto/bullets)
// ============================================================================

export function narrativeBlock(paragraphs: string[]): string {
  return paragraphs.map((p) =>
    `<p style="margin:0 0 10px;font-size:13px;color:${COLOR.neutral};line-height:1.55;">${p}</p>`
  ).join('');
}

export function bulletList(items: string[]): string {
  return `<ul style="margin:0;padding-left:20px;font-size:13px;color:${COLOR.neutral};line-height:1.6;">
${items.map((i) => `  <li>${i}</li>`).join('\n')}
</ul>`;
}
