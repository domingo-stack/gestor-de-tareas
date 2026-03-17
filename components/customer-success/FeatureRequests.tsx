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
  XMarkIcon,
} from '@heroicons/react/24/outline'

// --------------- Types ---------------

interface FeatureRequest {
  id: string
  bubble_id: string
  fecha: string
  nombre_apellido: string
  email: string
  pais: string
  telefono: string
  suscripcion: string
  titulo: string
  descripcion: string
  synced_at: string
}

type ViewMode = 'dashboard' | 'resumen' | 'database'
type ResumenPeriod = 'q' | 'month' | 'custom'
type SortField = 'fecha' | 'pais'
type SortDir = 'asc' | 'desc'

// --------------- Helpers ---------------

function dateOnly(d: string): string {
  return (d || '').slice(0, 10)
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

function getWeekRange(weekStart: Date): [string, string] {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return [localDateStr(weekStart), localDateStr(end)]
}

function getMonthRange(ref: Date): [string, string] {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  return [localDateStr(start), localDateStr(end)]
}

function getQuarterRange(ref: Date): [string, string] {
  const q = Math.floor(ref.getMonth() / 3)
  const start = new Date(ref.getFullYear(), q * 3, 1)
  const end = new Date(ref.getFullYear(), q * 3 + 3, 0)
  return [localDateStr(start), localDateStr(end)]
}

function isInRange(fecha: string, from: string, to: string): boolean {
  const d = dateOnly(fecha)
  return d >= from && d <= to
}

function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${start.toLocaleDateString('es-ES', opts)} - ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`
}

function fmtDate(d: string) {
  if (!d) return '—'
  const ds = dateOnly(d)
  const [y, m, day] = ds.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

const PAGE_SIZE = 20

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

  // Resumen-specific
  const [resumenPeriod, setResumenPeriod] = useState<ResumenPeriod>('q')
  const [resumenQ, setResumenQ] = useState(() => {
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3) + 1
    return `${now.getFullYear()}-Q${q}`
  })
  const [resumenCustomDesde, setResumenCustomDesde] = useState('')
  const [resumenCustomHasta, setResumenCustomHasta] = useState('')
  const [resumenMonth, setResumenMonth] = useState(() => new Date())

  // Database-specific
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [selectedRow, setSelectedRow] = useState<FeatureRequest | null>(null)
  const [dbFechaDesde, setDbFechaDesde] = useState('')
  const [dbFechaHasta, setDbFechaHasta] = useState('')

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
  useEffect(() => { setPage(1) }, [filterPais, filterSuscripcion, searchText, weekStart, sortField, sortDir, dbFechaDesde, dbFechaHasta])

  // --------------- Derived data ---------------

  const paises = useMemo(() =>
    [...new Set(requests.map(r => r.pais).filter(Boolean))].sort(),
    [requests]
  )

  const suscripciones = useMemo(() =>
    [...new Set(requests.map(r => r.suscripcion).filter(Boolean))].sort(),
    [requests]
  )

  // Filtered by common filters (pais, suscripcion)
  const baseFiltered = useMemo(() => {
    let result = requests
    if (filterPais) result = result.filter(r => r.pais === filterPais)
    if (filterSuscripcion) result = result.filter(r => r.suscripcion === filterSuscripcion)
    return result
  }, [requests, filterPais, filterSuscripcion])

  // Week/month ranges
  const [weekFrom, weekTo] = useMemo(() => getWeekRange(weekStart), [weekStart])
  const [monthFrom, monthTo] = useMemo(() => getMonthRange(weekStart), [weekStart])
  const [quarterFrom, quarterTo] = useMemo(() => getQuarterRange(weekStart), [weekStart])

  // Week items (for dashboard metrics)
  const weekItems = useMemo(() =>
    baseFiltered.filter(r => isInRange(r.fecha, weekFrom, weekTo)),
    [baseFiltered, weekFrom, weekTo]
  )

  // Month items (for dashboard metrics)
  const monthItems = useMemo(() =>
    baseFiltered.filter(r => isInRange(r.fecha, monthFrom, monthTo)),
    [baseFiltered, monthFrom, monthTo]
  )

  // Quarter items
  const quarterItems = useMemo(() =>
    baseFiltered.filter(r => isInRange(r.fecha, quarterFrom, quarterTo)),
    [baseFiltered, quarterFrom, quarterTo]
  )

  // --------------- Dashboard Metrics ---------------

  const metrics = useMemo(() => {
    const totalSemana = weekItems.length
    const totalMes = monthItems.length
    const totalQuarter = quarterItems.length

    // Top pais this week
    const paisCounts = new Map<string, number>()
    for (const r of weekItems) {
      if (r.pais) paisCounts.set(r.pais, (paisCounts.get(r.pais) || 0) + 1)
    }
    let topPais = '—'
    let topPaisCount = 0
    for (const [pais, count] of paisCounts) {
      if (count > topPaisCount) { topPais = pais; topPaisCount = count }
    }

    // Top suscripcion this week
    const subCounts = new Map<string, number>()
    for (const r of weekItems) {
      if (r.suscripcion) subCounts.set(r.suscripcion, (subCounts.get(r.suscripcion) || 0) + 1)
    }
    let topSub = '—'
    let topSubCount = 0
    for (const [sub, count] of subCounts) {
      if (count > topSubCount) { topSub = sub; topSubCount = count }
    }

    return { totalSemana, totalMes, totalQuarter, topPais, topPaisCount, topSub, topSubCount }
  }, [weekItems, monthItems, quarterItems])

  // --------------- Resumen data ---------------

  const resumenRange = useMemo((): [string, string] => {
    if (resumenPeriod === 'custom' && resumenCustomDesde && resumenCustomHasta) {
      return [resumenCustomDesde, resumenCustomHasta]
    }
    if (resumenPeriod === 'month') {
      return getMonthRange(resumenMonth)
    }
    // Quarter
    const [yearStr, qStr] = resumenQ.split('-Q')
    const year = parseInt(yearStr)
    const q = parseInt(qStr) - 1
    const start = new Date(year, q * 3, 1)
    const end = new Date(year, q * 3 + 3, 0)
    return [localDateStr(start), localDateStr(end)]
  }, [resumenPeriod, resumenQ, resumenCustomDesde, resumenCustomHasta, resumenMonth])

  const resumenItems = useMemo(() =>
    baseFiltered.filter(r => isInRange(r.fecha, resumenRange[0], resumenRange[1])),
    [baseFiltered, resumenRange]
  )

  // Weekly trend for resumen period
  const resumenWeeklyTrend = useMemo(() => {
    const weeks = new Map<string, number>()
    for (const r of resumenItems) {
      const d = dateOnly(r.fecha)
      if (!d) continue
      const [y, m, day] = d.split('-').map(Number)
      const date = new Date(y, m - 1, day)
      const monday = getMonday(date)
      const key = localDateStr(monday)
      weeks.set(key, (weeks.get(key) || 0) + 1)
    }
    return [...weeks.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, count]) => ({ week, count }))
  }, [resumenItems])

  // Country breakdown for resumen
  const resumenCountryBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of resumenItems) {
      if (r.pais) counts.set(r.pais, (counts.get(r.pais) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [resumenItems])

  // Subscription breakdown for resumen
  const resumenSubBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of resumenItems) {
      if (r.suscripcion) counts.set(r.suscripcion, (counts.get(r.suscripcion) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [resumenItems])

  // Available quarters
  const availableQuarters = useMemo(() => {
    const qs = new Set<string>()
    for (const r of requests) {
      const d = dateOnly(r.fecha)
      if (!d) continue
      const [y, m] = d.split('-').map(Number)
      const q = Math.floor((m - 1) / 3) + 1
      qs.add(`${y}-Q${q}`)
    }
    return [...qs].sort().reverse()
  }, [requests])

  // --------------- Database view data ---------------

  const databaseFiltered = useMemo(() => {
    let result = baseFiltered

    // Apply date range if set, otherwise show all
    if (dbFechaDesde || dbFechaHasta) {
      result = result.filter(r => {
        const d = dateOnly(r.fecha)
        if (dbFechaDesde && d < dbFechaDesde) return false
        if (dbFechaHasta && d > dbFechaHasta) return false
        return true
      })
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      result = result.filter(r =>
        (r.titulo && r.titulo.toLowerCase().includes(q)) ||
        (r.descripcion && r.descripcion.toLowerCase().includes(q)) ||
        (r.nombre_apellido && r.nombre_apellido.toLowerCase().includes(q)) ||
        (r.pais && r.pais.toLowerCase().includes(q))
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'fecha') {
        cmp = dateOnly(a.fecha).localeCompare(dateOnly(b.fecha))
      } else if (sortField === 'pais') {
        cmp = (a.pais || '').localeCompare(b.pais || '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [baseFiltered, dbFechaDesde, dbFechaHasta, searchText, sortField, sortDir])

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
      dateOnly(r.fecha),
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
    link.download = `feature_requests_${localDateStr(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }

  // --------------- Quarter label ---------------
  const quarterLabel = useMemo(() => {
    const q = Math.floor(weekStart.getMonth() / 3) + 1
    return `Q${q} ${weekStart.getFullYear()}`
  }, [weekStart])

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
            onClick={() => setViewMode('resumen')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'resumen'
                ? 'text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            style={viewMode === 'resumen' ? { backgroundColor: '#3c527a' } : undefined}
          >
            Resumen
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

        {/* Week selector (only for dashboard) */}
        {viewMode === 'dashboard' && (
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
        )}
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
              title={`Acumuladas ${quarterLabel}`}
              value={metrics.totalQuarter.toString()}
              icon={CalendarDaysIcon}
              color="bg-indigo-50 text-indigo-600"
            />
            <MetricCard
              title="Top país (semana)"
              value={metrics.topPais}
              subtitle={metrics.topPaisCount > 0 ? `${metrics.topPaisCount} solicitud${metrics.topPaisCount !== 1 ? 'es' : ''}` : undefined}
              icon={GlobeAltIcon}
              color="bg-green-50 text-green-600"
            />
          </div>

          {/* Top suscripcion + country breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Country breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Solicitudes por país (semana)</h3>
              {weekItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin datos esta semana</p>
              ) : (
                <CountryBreakdown items={weekItems} />
              )}
            </div>

            {/* Subscription breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Solicitudes por suscripción (semana)</h3>
              {weekItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin datos esta semana</p>
              ) : (
                <SubscriptionBreakdown items={weekItems} />
              )}
            </div>
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
      ) : viewMode === 'resumen' ? (
        /* ==================== RESUMEN VIEW ==================== */
        <div className="space-y-6">
          {/* Period selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setResumenPeriod('q')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  resumenPeriod === 'q' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
                style={resumenPeriod === 'q' ? { backgroundColor: '#3c527a' } : undefined}
              >
                Trimestre
              </button>
              <button
                onClick={() => setResumenPeriod('month')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  resumenPeriod === 'month' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
                style={resumenPeriod === 'month' ? { backgroundColor: '#3c527a' } : undefined}
              >
                Mes
              </button>
              <button
                onClick={() => setResumenPeriod('custom')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  resumenPeriod === 'custom' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
                style={resumenPeriod === 'custom' ? { backgroundColor: '#3c527a' } : undefined}
              >
                Personalizado
              </button>
            </div>

            {resumenPeriod === 'q' && (
              <select
                value={resumenQ}
                onChange={e => setResumenQ(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              >
                {availableQuarters.map(q => (
                  <option key={q} value={q}>{q.replace('-', ' ')}</option>
                ))}
              </select>
            )}

            {resumenPeriod === 'month' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setResumenMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d })}
                  className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {resumenMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setResumenMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d })}
                  disabled={resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear()}
                  className={`p-1.5 rounded-md border border-gray-200 transition-colors ${
                    resumenMonth.getMonth() === new Date().getMonth() && resumenMonth.getFullYear() === new Date().getFullYear() ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            )}

            {resumenPeriod === 'custom' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Desde</label>
                <input
                  type="date"
                  value={resumenCustomDesde}
                  onChange={e => setResumenCustomDesde(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <label className="text-xs text-gray-500">Hasta</label>
                <input
                  type="date"
                  value={resumenCustomHasta}
                  onChange={e => setResumenCustomHasta(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
            )}

            <span className="text-xs text-gray-400 ml-auto">
              {resumenRange[0]} → {resumenRange[1]}
            </span>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total solicitudes"
              value={resumenItems.length.toString()}
              icon={ClipboardDocumentListIcon}
              color="bg-blue-50 text-blue-600"
            />
            <MetricCard
              title="Promedio semanal"
              value={resumenWeeklyTrend.length > 0
                ? (resumenItems.length / resumenWeeklyTrend.length).toFixed(1)
                : '0'
              }
              icon={CalendarDaysIcon}
              color="bg-purple-50 text-purple-600"
            />
            <MetricCard
              title="Top país"
              value={resumenCountryBreakdown[0]?.[0] || '—'}
              subtitle={resumenCountryBreakdown[0] ? `${resumenCountryBreakdown[0][1]} solicitudes (${((resumenCountryBreakdown[0][1] / resumenItems.length) * 100).toFixed(0)}%)` : undefined}
              icon={GlobeAltIcon}
              color="bg-green-50 text-green-600"
            />
            <MetricCard
              title="Top suscripción"
              value={resumenSubBreakdown[0]?.[0] || '—'}
              subtitle={resumenSubBreakdown[0] ? `${resumenSubBreakdown[0][1]} solicitudes (${((resumenSubBreakdown[0][1] / resumenItems.length) * 100).toFixed(0)}%)` : undefined}
              icon={TagIcon}
              color="bg-orange-50 text-orange-600"
            />
          </div>

          {/* Weekly trend */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tendencia semanal</h3>
            {resumenWeeklyTrend.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Sin datos para el período seleccionado</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...resumenWeeklyTrend.map(w => w.count))
                  return resumenWeeklyTrend.map(w => (
                    <div key={w.week} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{w.week.slice(5)}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.max((w.count / max) * 100, 8)}%`, backgroundColor: '#3c527a' }}
                        >
                          <span className="text-[10px] font-bold text-white">{w.count}</span>
                        </div>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

          {/* Country + Subscription breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Por país</h3>
              {resumenCountryBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin datos</p>
              ) : (
                <div className="space-y-1.5">
                  {resumenCountryBreakdown.slice(0, 10).map(([pais, count]) => (
                    <div key={pais} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{pais}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{count}</span>
                        <span className="text-xs text-gray-400">({((count / resumenItems.length) * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Por suscripción</h3>
              {resumenSubBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin datos</p>
              ) : (
                <div className="space-y-1.5">
                  {resumenSubBreakdown.map(([sub, count]) => {
                    const pct = ((count / resumenItems.length) * 100).toFixed(0)
                    return (
                      <div key={sub} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-700">{sub}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{count}</span>
                          <span className="text-xs text-gray-400">({pct}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top recent requests */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Solicitudes recientes del período</h3>
            {resumenItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {resumenItems.slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-400 shrink-0 w-16 pt-0.5">{dateOnly(r.fecha).slice(5)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{r.titulo || 'Sin título'}</p>
                      <p className="text-xs text-gray-500 truncate">{r.descripcion || ''}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{r.pais}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== DATABASE VIEW ==================== */
        <div className="space-y-4">
          {/* Search + date filters + export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 w-64 bg-white focus-within:ring-1 focus-within:ring-blue-300 focus-within:border-blue-300">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar título, descripción, nombre..."
                className="text-xs bg-transparent outline-none flex-1 min-w-0 placeholder-gray-400"
              />
              {searchText && (
                <button onClick={() => setSearchText('')} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Desde</label>
              <input
                type="date"
                value={dbFechaDesde}
                onChange={e => setDbFechaDesde(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <label className="text-xs text-gray-500">Hasta</label>
              <input
                type="date"
                value={dbFechaHasta}
                onChange={e => setDbFechaHasta(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              {(dbFechaDesde || dbFechaHasta) && (
                <button
                  onClick={() => { setDbFechaDesde(''); setDbFechaHasta('') }}
                  className="text-xs text-red-500 hover:text-red-700 underline"
                >
                  Limpiar
                </button>
              )}
            </div>

            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 ml-auto"
              style={{ backgroundColor: '#3c527a' }}
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {databaseFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <InboxIcon className="w-10 h-10 mb-2" />
                <p>No se encontraron solicitudes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">
                        <button onClick={() => toggleSort('fecha')} className="flex items-center gap-1 hover:text-gray-800">
                          Fecha
                          {sortField === 'fecha' && (sortDir === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium w-1/4">Título</th>
                      <th className="px-4 py-3 font-medium">
                        <button onClick={() => toggleSort('pais')} className="flex items-center gap-1 hover:text-gray-800">
                          País
                          {sortField === 'pais' && (sortDir === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium">Suscripción</th>
                      <th className="px-4 py-3 font-medium w-1/3">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map(r => {
                      const isSelected = selectedRow?.id === r.id
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedRow(isSelected ? null : r)}
                          className={`border-b border-gray-50 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 border-l-2 border-l-[#3c527a]'
                              : 'hover:bg-gray-50/50'
                          }`}
                        >
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                          <td className="px-4 py-3 font-medium text-gray-900"><span className="block truncate max-w-[250px]">{r.titulo || '—'}</span></td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.pais || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.suscripcion || '—'}</td>
                          <td className="px-4 py-3 text-gray-600"><span className="block truncate max-w-[300px]">{r.descripcion || '—'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Sidebar — fixed overlay like PMF */}
          {selectedRow && (
            <>
              <div
                className="fixed inset-0 bg-black/20 z-40"
                onClick={() => setSelectedRow(null)}
              />
              <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto border-l border-gray-200">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[#383838]">{selectedRow.titulo || 'Sin título'}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(selectedRow.fecha)} · {selectedRow.pais || 'Sin país'}</p>
                  </div>
                  <button
                    onClick={() => setSelectedRow(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Info cards */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Email</p>
                    <p className="text-sm text-[#383838] break-all">{selectedRow.email || '—'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Nombre</p>
                      <p className="text-sm text-[#383838]">{selectedRow.nombre_apellido || '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Teléfono</p>
                      <p className="text-sm text-[#383838]">{selectedRow.telefono || '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Suscripción</p>
                      <p className="text-sm text-[#383838]">{selectedRow.suscripcion || '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">País</p>
                      <p className="text-sm text-[#383838]">{selectedRow.pais || '—'}</p>
                    </div>
                  </div>

                  {/* Título */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                      </svg>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Título</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed pl-5">{selectedRow.titulo || '—'}</p>
                  </div>

                  {/* Descripción */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Descripción</p>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed pl-5 whitespace-pre-wrap">{selectedRow.descripcion || '—'}</p>
                  </div>
                </div>
              </div>
            </>
          )}

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

function CountryBreakdown({ items }: { items: FeatureRequest[] }) {
  const counts = new Map<string, number>()
  for (const r of items) {
    if (r.pais) counts.set(r.pais, (counts.get(r.pais) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = sorted[0]?.[1] || 1

  return (
    <div className="space-y-2">
      {sorted.slice(0, 8).map(([pais, count]) => (
        <div key={pais} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{pais}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(count / max) * 100}%`, backgroundColor: '#3c527a' }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

function SubscriptionBreakdown({ items }: { items: FeatureRequest[] }) {
  const counts = new Map<string, number>()
  for (const r of items) {
    if (r.suscripcion) counts.set(r.suscripcion, (counts.get(r.suscripcion) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = sorted[0]?.[1] || 1

  const colors = ['#3c527a', '#ff8080', '#6366f1', '#f59e0b', '#10b981', '#8b5cf6']

  return (
    <div className="space-y-2">
      {sorted.map(([sub, count], i) => (
        <div key={sub} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{sub}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(count / max) * 100}%`, backgroundColor: colors[i % colors.length] }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}
