'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { CurrencyDollarIcon, ClockIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { ContentGeneration } from '@/lib/content-social-types';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  generated: { label: 'Generado', cls: 'bg-amber-100 text-amber-700' },
  edited: { label: 'Editado', cls: 'bg-blue-100 text-blue-700' },
  exported: { label: 'Exportado', cls: 'bg-green-100 text-green-700' },
  published: { label: 'Publicado', cls: 'bg-purple-100 text-purple-700' },
};

export default function HistoryTable() {
  const { supabase } = useAuth();
  const router = useRouter();
  const [generations, setGenerations] = useState<ContentGeneration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('content_generations').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setGenerations(data as ContentGeneration[]); setLoading(false); });
  }, [supabase]);

  const metrics = useMemo(() => {
    const thisMonth = generations.filter(g => {
      const d = new Date(g.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalCost = thisMonth.reduce((s, g) => s + (g.cost_usd || 0), 0);
    const modelCounts: Record<string, { count: number; cost: number }> = {};
    thisMonth.forEach(g => {
      const m = g.model_used || 'unknown';
      if (!modelCounts[m]) modelCounts[m] = { count: 0, cost: 0 };
      modelCounts[m].count++;
      modelCounts[m].cost += g.cost_usd || 0;
    });
    const bestModel = Object.entries(modelCounts).sort((a, b) => (a[1].cost / a[1].count) - (b[1].cost / b[1].count))[0];
    return {
      totalCost: totalCost.toFixed(2),
      totalGens: thisMonth.length,
      bestModel: bestModel ? `${bestModel[0].split('/').pop()} ($${(bestModel[1].cost / bestModel[1].count).toFixed(3)}/gen)` : '—',
    };
  }, [generations]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Gasto este mes</p>
            <p className="text-lg font-bold text-gray-800">${metrics.totalCost}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Generaciones este mes</p>
            <p className="text-lg font-bold text-gray-800">{metrics.totalGens}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <ClockIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Modelo más eficiente</p>
            <p className="text-sm font-bold text-gray-800">{metrics.bestModel}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Blog</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Modelo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Tokens</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Costo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Tiempo</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : generations.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin generaciones aún</td></tr>
            ) : (
              generations.map((gen, idx) => {
                const badge = STATUS_BADGE[gen.status] || STATUS_BADGE.generated;
                const carCount = gen.result?.carousels?.length || 0;
                return (
                  <tr key={gen.id}
                    onClick={() => router.push(`/contenido-social/${gen.blog_id}/${gen.id}`)}
                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {new Date(gen.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{' '}
                      <span className="text-gray-400">{new Date(gen.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium truncate max-w-[250px]">{gen.blog_title}</td>
                    <td className="px-4 py-2.5 text-gray-600">{carCount} carr.</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{gen.model_used?.split('/').pop() || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{gen.tokens_used?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{gen.cost_usd ? `$${gen.cost_usd.toFixed(3)}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{gen.processing_time_ms ? `${(gen.processing_time_ms / 1000).toFixed(0)}s` : '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
