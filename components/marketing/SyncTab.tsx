'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface SyncLogRow {
  id: string;
  source: string;
  status: string;
  records_processed: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));
  if (hours > 24) return `hace ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `hace ${hours}h`;
  if (minutes > 0) return `hace ${minutes}min`;
  return 'ahora';
}

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  facebook_organic: 'Facebook Orgánico',
  instagram_organic: 'Instagram Orgánico',
  youtube_organic: 'YouTube',
  tiktok_organic: 'TikTok Orgánico',
  ga4: 'Google Analytics 4',
};

export default function SyncTab() {
  const { supabase } = useAuth();
  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;

    const fetchLogs = async () => {
      setLoading(true);

      // Get latest log per source
      const { data } = await supabase
        .from('mkt_sync_logs')
        .select('id, source, status, records_processed, error_message, started_at, finished_at, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        // Keep only the latest per source
        const latest = new Map<string, SyncLogRow>();
        for (const row of data as SyncLogRow[]) {
          if (!latest.has(row.source)) {
            latest.set(row.source, row);
          }
        }
        setLogs(Array.from(latest.values()).sort((a, b) => (SOURCE_LABELS[a.source] || a.source).localeCompare(SOURCE_LABELS[b.source] || b.source)));
      }

      setLoading(false);
    };

    fetchLogs();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No hay registros de sincronización</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-700">Estado de sincronizaciones</h3>
        <p className="text-xs text-gray-400 mt-0.5">Última ejecución de cada fuente de datos</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Fuente</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3">Registros</th>
              <th className="px-6 py-3">Último sync</th>
              <th className="px-6 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((log) => {
              const ts = log.finished_at || log.created_at;
              const hoursOld = (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60);
              const isStale = hoursOld > 8;
              const isError = log.status === 'error';
              const isRunning = log.status === 'running';

              return (
                <tr key={log.source} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {SOURCE_LABELS[log.source] || log.source}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      isError
                        ? 'bg-red-50 text-red-700'
                        : isRunning
                          ? 'bg-blue-50 text-blue-700'
                          : isStale
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                    }`}>
                      {isError ? (
                        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                      ) : isRunning ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : isStale ? (
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                      )}
                      {isError ? 'Error' : isRunning ? 'Ejecutando' : isStale ? 'Desactualizado' : 'OK'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {log.records_processed != null ? log.records_processed.toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    <div>{formatDateTime(ts)}</div>
                    <div className="text-xs text-gray-400">{timeAgo(ts)}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-500 max-w-xs truncate" title={log.error_message || undefined}>
                    {log.error_message || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
