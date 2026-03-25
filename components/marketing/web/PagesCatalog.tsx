'use client';

import { useState, useRef, useCallback } from 'react';
import { DateRange } from '../shared/useDateRange';
import { usePagesCatalog } from '../shared/useMarketingData';
import { fmtNum } from '@/components/growth/formatters';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface PagesCatalogProps {
  range: DateRange;
}

const PAGE_TYPE_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'blog', label: 'Blog' },
  { value: 'web_core', label: 'Web (core)' },
  { value: 'app', label: 'App' },
];

const TYPE_BADGE: Record<string, string> = {
  blog: 'bg-purple-50 text-purple-700',
  web_core: 'bg-blue-50 text-blue-700',
  app: 'bg-green-50 text-green-700',
};

export default function PagesCatalog({ range }: PagesCatalogProps) {
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
  }, []);

  const { pages, loading } = usePagesCatalog(range, filterType, debouncedSearch);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-700">Catálogo de páginas</h3>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por slug..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-gray-700 w-52 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700"
            >
              {PAGE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : pages.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No se encontraron páginas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3 text-left">Página</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Hostname</th>
                <th className="px-4 py-3 text-right">Vistas</th>
                <th className="px-4 py-3 text-right">Sesiones</th>
                <th className="px-4 py-3 text-right">Última vez</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 max-w-[350px]">
                    <p className="font-medium text-gray-900 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 truncate">{p.path}</p>
                  </td>
                  <td className="px-4 py-3">
                    {p.pageType && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_BADGE[p.pageType] || 'bg-gray-50 text-gray-600'}`}>
                        {p.pageType === 'web_core' ? 'web' : p.pageType}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.hostname}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmtNum(p.totalViews)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtNum(p.totalSessions)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">{p.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
