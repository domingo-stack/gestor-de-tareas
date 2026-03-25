'use client';

import { DateRange } from '../shared/useDateRange';
import { useWebData, WebHostnameKpis } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';
import KpiCard from '@/components/growth/KpiCard';
import SyncStatus from '../shared/SyncStatus';
import EmptyState from '../shared/EmptyState';
import PagesCatalog from './PagesCatalog';
import {
  GlobeAltIcon,
  UserGroupIcon,
  UserPlusIcon,
  DocumentTextIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

interface WebAnalyticsProps {
  range: DateRange;
}

const HOSTNAME_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  'app.califica.ai': { label: 'App', desc: 'Plataforma principal', color: 'bg-green-50 text-green-700' },
  'califica.ai': { label: 'Web + Blog', desc: 'Sitio web y blog', color: 'bg-blue-50 text-blue-700' },
};

function HostnameCard({ data }: { data: WebHostnameKpis }) {
  const config = HOSTNAME_LABELS[data.hostname] || { label: data.hostname, desc: '', color: 'bg-gray-50 text-gray-700' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${config.color}`}>
          {config.label}
        </span>
        <span className="text-xs text-gray-400">{data.hostname}</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500">Sesiones</p>
          <p className="text-lg font-bold text-gray-900">{fmtNum(data.sessions)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Usuarios activos</p>
          <p className="text-lg font-bold text-gray-900">{fmtNum(data.activeUsers)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Usuarios nuevos</p>
          <p className="text-lg font-bold text-gray-900">{fmtNum(data.newUsers)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Vistas de página</p>
          <p className="text-lg font-bold text-gray-900">{fmtNum(data.pageViews)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Dur. promedio</p>
          <p className="text-lg font-bold text-gray-900">{data.avgSessionMinutes.toFixed(1)} min</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Conversiones GA4</p>
          <p className="text-lg font-bold text-gray-900">{fmtNum(data.conversionsGa4)}</p>
        </div>
      </div>
    </div>
  );
}

export default function WebAnalytics({ range }: WebAnalyticsProps) {
  const { kpis, hostnameKpis, sources, topPages, loading, hasData } = useWebData(range);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!hasData || !kpis) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <EmptyState platform="Google Analytics 4" message="GA4 no está conectado. Configura las credenciales de GA4 para ver tráfico web y blog." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SyncStatus sources={['ga4']} />

      <p className="text-xs text-gray-400">
        Nota: Los datos de GA4 pueden tener hasta 48h de delay. Los datos recientes son estimados.
      </p>

      {/* Consolidated KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard title="Sesiones" value={fmtNum(kpis.sessions)} icon={GlobeAltIcon} colorClass="bg-blue-500" />
        <KpiCard title="Usuarios activos" value={fmtNum(kpis.activeUsers)} icon={UserGroupIcon} colorClass="bg-indigo-500" />
        <KpiCard title="Usuarios nuevos" value={fmtNum(kpis.newUsers)} icon={UserPlusIcon} colorClass="bg-green-500" />
        <KpiCard title="Vistas de página" value={fmtNum(kpis.pageViews)} icon={DocumentTextIcon} colorClass="bg-purple-500" />
        <KpiCard title="Duración prom." value={kpis.avgSessionMinutes.toFixed(1) + ' min'} icon={ClockIcon} colorClass="bg-amber-500" />
        <KpiCard
          title="Conversiones GA4"
          value={fmtNum(kpis.conversionsGa4)}
          icon={ArrowTrendingUpIcon}
          colorClass="bg-emerald-500"
          subtext="Pueden ser parciales"
        />
      </div>

      {/* Hostname breakdown */}
      {hostnameKpis.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Por dominio</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hostnameKpis.map((h) => (
              <HostnameCard key={h.hostname} data={h} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sources table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Fuentes de tráfico</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Canal</th>
                  <th className="px-4 py-3 text-right">Sesiones</th>
                  <th className="px-4 py-3 text-right">Nuevos</th>
                  <th className="px-4 py-3 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sources.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.channel}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(s.sessions)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(s.newUsers)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(s.conversions)}</td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sin datos de fuentes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top pages table (from mkt_web_page_metrics) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Top 20 páginas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Página</th>
                  <th className="px-4 py-3 text-right">Vistas</th>
                  <th className="px-4 py-3 text-right">Dur. prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topPages.map((pg, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 max-w-[300px]">
                      <p className="font-medium truncate">{pg.title || pg.path}</p>
                      <p className="text-xs text-gray-400 truncate">{pg.hostname}{pg.path}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(pg.pageViews)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{(pg.avgDurationSeconds / 60).toFixed(1)}m</td>
                  </tr>
                ))}
                {topPages.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin datos de páginas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Full pages catalog */}
      <PagesCatalog range={range} />
    </div>
  );
}
