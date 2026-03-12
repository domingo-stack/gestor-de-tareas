'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  InboxIcon,
  LightBulbIcon,
  SparklesIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  TagIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'

// --------------- Types ---------------

interface FeatureRequest {
  id: string
  bubble_id: string
  fecha: string
  nombre_apellido: string
  pais: string
  telefono: string
  suscripcion: string
  titulo: string
  descripcion: string
  synced_at: string
}

type ViewMode = 'dashboard' | 'database'
type SortField = 'fecha' | 'pais'
type SortDir = 'asc' | 'desc'

// --------------- Helpers ---------------

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getCurrentWeekStart(): Date {
  return getMonday(new Date())
}

function getWeekEnd(start: Date): Date {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${start.toLocaleDateString('es-ES', opts)} - ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isInWeek(fecha: string, weekStart: Date): boolean {
  const d = new Date(fecha + 'T00:00:00')
  const weekEnd = getWeekEnd(weekStart)
  return d >= weekStart && d <= weekEnd
}

function isInMonth(fecha: string, weekStart: Date): boolean {
  const d = new Date(fecha + 'T00:00:00')
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
  const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0, 23, 59, 59, 999)
  return d >= monthStart && d <= monthEnd
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

const PAGE_SIZE = 50

// --------------- Component ---------------

export default function FeatureRequests() {
  const { supabase } = useAuth()

  // Data
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [loading, setLoading] = useState(true)

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard')

  // Week selector
  const [weekStart, setWeekStart] = useState<Date>(() => getCurrentWeekStart())

  // Filters
  const [filterPais, setFilterPais] = useState('')
  const [filterSuscripcion, setFilterSuscripcion] = useState('')

  // Database-specific
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // --------------- Fetch ---------------

  const fetchData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('feature_requests')
        .select('*')
        .order('fecha', { ascending: false })
      if (error) throw error
      setRequests(data || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cargando solicitudes'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [filterPais, filterSuscripcion, searchText, weekStart, sortField, sortDir])

  // --------------- Derived data ---------------

  const paises = useMemo(() =>
    [...new Set(requests.map(r => r.pais).filter(Boolean))].sort(),
    [requests]
  )

  const suscripciones = useMemo(() =>
    [...new Set(requests.map(r => r.suscripcion).filter(Boolean))].sort(),
    [requests]
  )

  // Filtered by common filters (week, pais, suscripcion)
  const weekFiltered = useMemo(() => {
    let result = requests

    if (filterPais) result = result.filter(r => r.pais === filterPais)
    if (filterSuscripcion) result = result.filter(r => r.suscripcion === filterSuscripcion)

    return result
  }, [requests, filterPais, filterSuscripcion])

  // Week items (for dashboard metrics)
  const weekItems = useMemo(() =>
    weekFiltered.filter(r => isInWeek(r.fecha, weekStart)),
    [weekFiltered, weekStart]
  )

  // Month items (for dashboard metrics)
  const monthItems = useMemo(() =>
    weekFiltered.filter(r => isInMonth(r.fecha, weekStart)),
    [weekFiltered, weekStart]
  )

  // --------------- Dashboard Metrics ---------------

  const metrics = useMemo(() => {
    const totalSemana = weekItems.length
    const totalMes = monthItems.length

    // Top pais this week
    const paisCounts = new Map<string, number>()
    for (const r of weekItems) {
      if (r.pais) paisCounts.set(r.pais, (paisCounts.get(r.pais) || 0) + 1)
    }
    let topPais = '\u2014'
    let topPaisCount = 0
    for (const [pais, count] of paisCounts) {
      if (count > topPaisCount) { topPais = pais; topPaisCount = count }
    }

    // Top suscripcion this week
    const subCounts = new Map<string, number>()
    for (const r of weekItems) {
      if (r.suscripcion) subCounts.set(r.suscripcion, (subCounts.get(r.suscripcion) || 0) + 1)
    }
    let topSub = '\u2014'
    let topSubCount = 0
    for (const [sub, count] of subCounts) {
      if (count > topSubCount) { topSub = sub; topSubCount = count }
    }

    return { totalSemana, totalMes, topPais, topPaisCount, topSub, topSubCount }
  }, [weekItems, monthItems])

  // --------------- Database view data ---------------

  const databaseFiltered = useMemo(() => {
    let result = weekFiltered.filter(r => isInWeek(r.fecha, weekStart))

    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      result = result.filter(r =>
        (r.titulo && r.titulo.toLowerCase().includes(q)) ||
        (r.descripcion && r.descripcion.toLowerCase().includes(q))
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'fecha') {
        cmp = a.fecha.localeCompare(b.fecha)
      } else if (sortField === 'pais') {
        cmp = (a.pais || '').localeCompare(b.pais || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [weekFiltered, weekStart, searchText, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(databaseFiltered.length / PAGE_SIZE))
  const pageData = useMemo(() =>
    databaseFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [databaseFiltered, page]
  )

  // --------------- Week navigation ---------------

  const goBack = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
  }

  const goForward = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    const now = getCurrentWeekStart()
    if (next <= now) setWeekStart(next)
  }

  const isCurrentWeek = weekStart.getTime() === getCurrentWeekStart().getTime()

  // --------------- Sort toggle ---------------

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // --------------- Export CSV ---------------

  function exportCSV() {
    if (databaseFiltered.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    const headers = ['Fecha', 'Nombre', 'País', 'Teléfono', 'Suscripción', 'Título', 'Descripción']
    const rows = databaseFiltered.map(r => [
      r.fecha,
      r.nombre_apellido || '',
      r.pais || '',
      r.telefono || '',
      r.suscripcion || '',
      r.titulo || '',
      (r.descripcion || '').replace(/"/g, '""'),
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `feature_requests_${weekStart.toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }

  // --------------- Render ---------------

  return (
    <div className="space-y-6">
      {/* Header: view toggle + week selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* View toggle */}
        <div className="flex bg-white rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => setViewMode('dashboard')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'dashboard'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            style={viewMode === 'dashboard' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Dashboard
          </button>
          <button
            onClick={() => setViewMode('database')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'database'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            style={viewMode === 'database' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Base de datos
          </button>
        </div>

        {/* Week selector */}
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={goForward}
            disabled={isCurrentWeek}
            className={`p-1.5 rounded-md border border-gray-200 transition-colors ${
              isCurrentWeek ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(getCurrentWeekStart())}
              className="text-xs font-medium hover:opacity-80"
              style={{ color: '#3c527a' }}
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterPais}
          onChange={e => setFilterPais(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
        >
          <option value="">Todos los países</option>
          {paises.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterSuscripcion}
          onChange={e => setFilterSuscripcion(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
        >
          <option value="">Todas las suscripciones</option>
          {suscripciones.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterPais || filterSuscripcion) && (
          <button
            onClick={() => { setFilterPais(''); setFilterSuscripcion('') }}
            className="text-sm text-red-500 hover:text-red-700 underline"
          >
            Limpiar filtros
          </button>
        )}

        {/* Database-only: search + export */}
        {viewMode === 'database' && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar en título o descripción..."
                className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
              />
            </div>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: '#3c527a' }}
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Exportar CSV
            </button>
          </>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div>
      ) : viewMode === 'dashboard' ? (
        /* ==================== DASHBOARD VIEW ==================== */
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Solicitudes de la semana"
              value={metrics.totalSemana.toString()}
              icon={ClipboardDocumentListIcon}
              color="bg-blue-50 text-blue-600"
            />
            <MetricCard
              title="Acumuladas del mes"
              value={metrics.totalMes.toString()}
              icon={CalendarDaysIcon}
              color="bg-purple-50 text-purple-600"
            />
            <MetricCard
              title="Top país (semana)"
              value={metrics.topPais}
              subtitle={metrics.topPaisCount > 0 ? `${metrics.topPaisCount} solicitud${metrics.topPaisCount !== 1 ? 'es' : ''}` : undefined}
              icon={GlobeAltIcon}
              color="bg-green-50 text-green-600"
            />
            <MetricCard
              title="Top suscripción (semana)"
              value={metrics.topSub}
              subtitle={metrics.topSubCount > 0 ? `${metrics.topSubCount} solicitud${metrics.topSubCount !== 1 ? 'es' : ''}` : undefined}
              icon={TagIcon}
              color="bg-orange-50 text-orange-600"
            />
          </div>

          {/* AI Clustering placeholder */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-purple-500" />
                <h3 className="text-base font-semibold text-gray-900">Clustering IA — Temas principales</h3>
              </div>
              <div className="relative group">
                <button
                  disabled
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white opacity-50 cursor-not-allowed"
                  style={{ backgroundColor: '#3c527a' }}
                >
                  Analizar
                </button>
                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Proximamente
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <LightBulbIcon className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm text-center max-w-md">
                Presiona &quot;Analizar&quot; para agrupar solicitudes por tema usando IA.
                Los temas se mostrarán como tarjetas con barras de progreso indicando frecuencia.
              </p>
            </div>
          </div>

          {/* AI Summary placeholder */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-semibold text-gray-900">Resumen narrativo IA</h3>
              </div>
              <div className="relative group">
                <button
                  disabled
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white opacity-50 cursor-not-allowed"
                  style={{ backgroundColor: '#3c527a' }}
                >
                  Analizar
                </button>
                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Proximamente
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <DocumentTextIcon className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-sm text-center max-w-md">
                Presiona &quot;Analizar&quot; para generar un resumen ejecutivo de las solicitudes de la semana usando IA.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== DATABASE VIEW ==================== */
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {databaseFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <InboxIcon className="w-10 h-10 mb-2" />
                <p>No se encontraron solicitudes para esta semana</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">
                        <button
                          onClick={() => toggleSort('fecha')}
                          className="flex items-center gap-1 hover:text-gray-800"
                        >
                          Fecha
                          {sortField === 'fecha' && (
                            sortDir === 'asc'
                              ? <ChevronUpIcon className="w-3 h-3" />
                              : <ChevronDownIcon className="w-3 h-3" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">
                        <button
                          onClick={() => toggleSort('pais')}
                          className="flex items-center gap-1 hover:text-gray-800"
                        >
                          País
                          {sortField === 'pais' && (
                            sortDir === 'asc'
                              ? <ChevronUpIcon className="w-3 h-3" />
                              : <ChevronDownIcon className="w-3 h-3" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium">Suscripción</th>
                      <th className="px-4 py-3 font-medium">Título</th>
                      <th className="px-4 py-3 font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map(r => {
                      const isExpanded = expandedRow === r.id
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setExpandedRow(isExpanded ? null : r.id)}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.nombre_apellido || '\u2014'}</td>
                          <td className="px-4 py-3 text-gray-600">{r.pais || '\u2014'}</td>
                          <td className="px-4 py-3 text-gray-600">{r.suscripcion || '\u2014'}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{r.titulo || '\u2014'}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs">
                            {isExpanded
                              ? (r.descripcion || '\u2014')
                              : truncate(r.descripcion || '', 100) || '\u2014'
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {databaseFiltered.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {databaseFiltered.length} resultado{databaseFiltered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    page === 1
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    page === totalPages
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --------------- Sub-components ---------------

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  const parts = color.split(' ')
  const bgColor = parts[0] || ''
  const textColor = parts[1] || ''
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{value}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-2.5 rounded-lg ${bgColor}`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
    </div>
  )
}
