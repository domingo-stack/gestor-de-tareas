'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface SyncStatusProps {
  /** Uno o más sources de mkt_sync_logs para consultar */
  sources: string[];
}

interface SyncLog {
  source: string;
  status: string;
  error_message: string | null;
  finished_at: string | null;
  created_at: string;
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

export default function SyncStatus({ sources }: SyncStatusProps) {
  const { supabase } = useAuth();
  const [logs, setLogs] = useState<SyncLog[]>([]);

  useEffect(() => {
    if (!supabase || sources.length === 0) return;

    const fetchLogs = async () => {
      // Obtener el último log de cada source
      const { data } = await supabase
        .from('mkt_sync_logs')
        .select('source, status, error_message, finished_at, created_at')
        .in('source', sources)
        .order('created_at', { ascending: false })
        .limit(sources.length * 2);

      if (data) {
        // Quedarnos con el más reciente de cada source
        const latest = new Map<string, SyncLog>();
        for (const row of data as SyncLog[]) {
          if (!latest.has(row.source)) {
            latest.set(row.source, row);
          }
        }
        setLogs(Array.from(latest.values()));
      }
    };

    fetchLogs();
  }, [supabase, sources]);

  if (logs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {logs.map((log) => {
        const ts = log.finished_at || log.created_at;
        const hoursOld = (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60);
        const isStale = hoursOld > 8;
        const isError = log.status === 'error';

        return (
          <div
            key={log.source}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              isError
                ? 'border-red-200 bg-red-50 text-red-700'
                : isStale
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-green-200 bg-green-50 text-green-700'
            }`}
            title={isError && log.error_message ? log.error_message : undefined}
          >
            {isError ? (
              <ExclamationTriangleIcon className="w-3 h-3" />
            ) : isStale ? (
              <ArrowPathIcon className="w-3 h-3" />
            ) : (
              <CheckCircleIcon className="w-3 h-3" />
            )}
            <span className="font-medium">{log.source.replace(/_/g, ' ')}</span>
            <span className="opacity-75">{timeAgo(ts)}</span>
          </div>
        );
      })}
    </div>
  );
}
