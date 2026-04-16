'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import WeekSelector, { getCurrentWeekStart, toDateStr } from './WeekSelector';
import { fmtNum, fmtUSD, fmtPct } from './formatters';

const COLOR_PALETTE: Record<SectionData['color'], string[]> = {
  blue: ['#3B82F6', '#60A5FA', '#1D4ED8', '#93C5FD'],
  amber: ['#F59E0B', '#FBBF24', '#D97706', '#FCD34D', '#92400E', '#FDE68A'],
  green: ['#10B981', '#34D399', '#047857', '#6EE7B7', '#065F46'],
};

type MetricFormat = 'number' | 'pct' | 'usd';
type MetricStatus = 'ok' | 'stale' | 'pending';

interface MetricRow {
  key: string;
  label: string;
  format: MetricFormat;
  values: number[];
  status: MetricStatus;
  source: string;
  stale_since?: string | null;
}

interface SectionData {
  name: string;
  color: 'blue' | 'amber' | 'green';
  metrics: MetricRow[];
}

interface WeekMeta {
  week_start: string;
  label: string;
}

interface OperationalData {
  meta: {
    weeks: WeekMeta[];
    p_week_start: string;
    p_weeks: number;
    country_filter: string | null;
    country_options: string[];
    dau_stale: boolean;
    dau_last_date: string | null;
    events_stale?: boolean;
    events_last_date?: string | null;
  };
  sections: SectionData[];
}

function formatValue(v: number | null | undefined, format: MetricFormat): string {
  if (v === null || v === undefined) return '—';
  if (format === 'usd') return fmtUSD(v);
  if (format === 'pct') return fmtPct(v);
  return fmtNum(v);
}

const SECTION_STYLES: Record<SectionData['color'], { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-l-blue-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-l-amber-500' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-l-emerald-500' },
};

export default function OperacionalTab() {
  const { supabase } = useAuth();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OperationalData | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: result, error } = await supabase.rpc('get_weekly_operational_metrics', {
          p_week_start: toDateStr(weekStart),
          p_weeks: weeks,
          p_country_filter: countryFilter === 'all' ? null : countryFilter,
        });
        if (error) {
          console.error('RPC get_weekly_operational_metrics error:', error);
          setData(null);
        } else if (result) {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          setData(parsed as OperationalData);
        }
      } catch (err) {
        console.error('Error fetching operational metrics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase, weekStart, weeks, countryFilter]);

  const weekLabels = data?.meta.weeks ?? [];

  // Index all selectable (non-pending) metrics with their color + section
  const metricIndex = useMemo(() => {
    const map = new Map<string, { label: string; format: MetricFormat; values: number[]; color: string; section: string }>();
    if (!data) return map;
    data.sections.forEach((section) => {
      const palette = COLOR_PALETTE[section.color];
      let idx = 0;
      section.metrics.forEach((m) => {
        if (m.status === 'pending') return;
        map.set(m.key, {
          label: m.label,
          format: m.format,
          values: m.values,
          color: palette[idx % palette.length],
          section: section.name,
        });
        idx += 1;
      });
    });
    return map;
  }, [data]);

  // Default-select first metric of each section when data arrives
  useEffect(() => {
    if (!data || selectedKeys.size > 0) return;
    const defaults = new Set<string>();
    data.sections.forEach((section) => {
      const first = section.metrics.find((m) => m.status !== 'pending');
      if (first) defaults.add(first.key);
    });
    if (defaults.size > 0) setSelectedKeys(defaults);
  }, [data, selectedKeys.size]);

  const chartData = useMemo(() => {
    return weekLabels.map((w, i) => {
      const row: Record<string, string | number> = { week: w.label };
      selectedKeys.forEach((key) => {
        const m = metricIndex.get(key);
        if (m) row[key] = m.values[i] ?? 0;
      });
      return row;
    });
  }, [weekLabels, selectedKeys, metricIndex]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSection = (sectionName: string) => {
    if (!data) return;
    const section = data.sections.find((s) => s.name === sectionName);
    if (!section) return;
    const sectionKeys = section.metrics.filter((m) => m.status !== 'pending').map((m) => m.key);
    const allSelected = sectionKeys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) sectionKeys.forEach((k) => next.delete(k));
      else sectionKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Métricas Operacionales Semanales</h2>
          <p className="text-sm text-gray-500 mt-0.5">Pulso semanal del funnel, producto y ventas</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white min-w-[140px]"
          >
            <option value="all">🌎 Todos los países</option>
            {data?.meta.country_options?.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white"
          >
            <option value={4}>4 semanas</option>
            <option value={8}>8 semanas</option>
            <option value={12}>12 semanas</option>
          </select>
          <WeekSelector weekStart={weekStart} onWeekChange={setWeekStart} />
        </div>
      </div>

      {data?.meta.dau_stale && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <strong>DAU desactualizado:</strong> última fecha sincronizada {data.meta.dau_last_date ?? 'desconocida'}. El workflow n8n{' '}
            <code className="bg-amber-100 px-1 rounded">GRW_Sync_Mixpanel_Metrics</code> puede estar pausado o con error.
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-gray-900 z-10 min-w-[280px]">
                  Métrica
                </th>
                {weekLabels.map((w) => (
                  <th key={w.week_start} className="text-right px-3 py-3 font-medium min-w-[80px]">
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={weekLabels.length + 1} className="px-4 py-8 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              )}

              {!loading && !data && (
                <tr>
                  <td colSpan={weeks + 1} className="px-4 py-8 text-center text-red-500 text-sm">
                    No se pudo cargar la data. Verifica que la RPC <code>get_weekly_operational_metrics</code> esté deployada.
                  </td>
                </tr>
              )}

              {!loading &&
                data?.sections.map((section) => {
                  const styles = SECTION_STYLES[section.color];
                  return (
                    <Fragment key={`section-${section.name}`}>
                      <tr>
                        <td
                          colSpan={weekLabels.length + 1}
                          className={`px-4 py-2 font-semibold text-xs uppercase tracking-wide ${styles.bg} ${styles.text} border-l-4 ${styles.border}`}
                        >
                          {section.name}
                        </td>
                      </tr>
                      {section.metrics.map((metric, idx) => (
                        <tr
                          key={`${section.name}-${metric.key}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                        >
                          <td
                            className="px-4 py-2.5 text-gray-700 sticky left-0 bg-inherit"
                            title={metric.source}
                          >
                            <div className="flex items-center gap-2">
                              <span>{metric.label}</span>
                              {metric.status === 'stale' && (
                                <span title="Data desactualizada">
                                  <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                                </span>
                              )}
                            </div>
                          </td>
                          {weekLabels.map((w, i) => {
                            const value = metric.values[i];
                            const isPending = metric.status === 'pending';
                            return (
                              <td
                                key={w.week_start}
                                className={`px-3 py-2.5 text-right font-mono text-xs ${
                                  isPending
                                    ? 'bg-gray-100/80 text-gray-400 italic'
                                    : metric.status === 'stale'
                                      ? 'text-amber-700'
                                      : 'text-gray-800'
                                }`}
                                title={isPending ? 'Próximamente: ' + metric.source : metric.source}
                              >
                                {isPending ? '—' : formatValue(value, metric.format)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-400 flex flex-wrap gap-4">
        <span>
          <span className="inline-block w-3 h-3 bg-gray-100 rounded-sm align-middle mr-1"></span> Próximamente (pipeline Mixpanel pendiente)
        </span>
        <span>
          <ExclamationTriangleIcon className="w-3 h-3 text-amber-500 inline-block align-middle" /> Data desactualizada
        </span>
      </div>

      {/* Tendencia: chart con selector de métricas por sección */}
      {data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-700">Tendencia visual</h3>
              <p className="text-xs text-gray-500 mt-0.5">Selecciona métricas para comparar. Ojo: mezclar escalas distintas (ej. % con miles) puede achatar las líneas.</p>
            </div>
            <button
              onClick={() => setSelectedKeys(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Limpiar selección
            </button>
          </div>

          {/* Selector de métricas por sección */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.sections.map((section) => {
              const styles = SECTION_STYLES[section.color];
              const available = section.metrics.filter((m) => m.status !== 'pending');
              const allSelected = available.length > 0 && available.every((m) => selectedKeys.has(m.key));
              return (
                <div key={section.name} className={`rounded-lg border border-gray-200 overflow-hidden`}>
                  <button
                    onClick={() => toggleSection(section.name)}
                    className={`w-full px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${styles.bg} ${styles.text} border-l-4 ${styles.border} hover:brightness-95 flex items-center justify-between`}
                  >
                    <span>{section.name}</span>
                    <span className="text-[10px] normal-case font-medium opacity-70">
                      {allSelected ? 'Quitar todas' : 'Todas'}
                    </span>
                  </button>
                  <div className="p-2 space-y-1">
                    {section.metrics.map((m) => {
                      const isPending = m.status === 'pending';
                      const isChecked = selectedKeys.has(m.key);
                      const indexed = metricIndex.get(m.key);
                      return (
                        <label
                          key={m.key}
                          className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                            isPending ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isPending}
                            checked={isChecked}
                            onChange={() => toggleKey(m.key)}
                            className="rounded"
                          />
                          {indexed && (
                            <span
                              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: isChecked ? indexed.color : 'transparent', border: `1px solid ${indexed.color}` }}
                            />
                          )}
                          <span className={isPending ? 'italic' : 'text-gray-700'}>{m.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="h-80 w-full">
            {selectedKeys.size === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Selecciona al menos una métrica para ver la tendencia
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="week" stroke="#9CA3AF" fontSize={11} />
                  <YAxis stroke="#9CA3AF" fontSize={11} tickFormatter={(v: number) => fmtNum(v)} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    formatter={(value: number, name: string) => {
                      const m = metricIndex.get(name);
                      if (!m) return [fmtNum(value), name];
                      const formatted =
                        m.format === 'usd' ? fmtUSD(value) : m.format === 'pct' ? fmtPct(value) : fmtNum(value);
                      return [formatted, m.label];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value: string) => {
                      const m = metricIndex.get(value);
                      return <span className="text-xs text-gray-600">{m?.label ?? value}</span>;
                    }}
                  />
                  {Array.from(selectedKeys).map((key) => {
                    const m = metricIndex.get(key);
                    if (!m) return null;
                    return (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={m.color}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: m.color }}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
