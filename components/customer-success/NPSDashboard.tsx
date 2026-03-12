'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'

// --------------- Types ---------------

interface NPSResponse {
  id: string
  bubble_id: string
  fecha: string
  nombre_apellido: string
  pais: string
  telefono: string
  fecha_creacion_cuenta: string
  suscripcion: string
  score: number
  como_mejorar: string
  principal_beneficio: string
  synced_at: string
}

type ViewMode = 'dashboard' | 'database'
type SortField = 'fecha' | 'score' | 'pais'
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

function formatWeekLabel(start: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('es-ES', opts)} – ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return {
    start: weekStart.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getMonthRange(weekStart: Date): { start: string; end: string } {
  const year = weekStart.getFullYear()
  const month = weekStart.getMonth()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function classifyScore(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter'
  if (score >= 7) return 'passive'
  return 'detractor'
}

function computeNPS(responses: NPSResponse[]): number | null {
  if (responses.length === 0) return null
  const promoters = responses.filter(r => r.score >= 9).length
  const detractors = responses.filter(r => r.score <= 6).length
  return Math.round(((promoters - detractors) / responses.length) * 100)
}

function scoreBarColor(score: number): string {
  if (score >= 9) return '#22c55e'
  if (score >= 7) return '#eab308'
  return '#ef4444'
}

function scoreBadgeClasses(score: number): string {
  if (score >= 9) return 'bg-green-100 text-green-800'
  if (score >= 7) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

// --------------- Component ---------------

export default function NPSDashboard() {
  const { supabase } = useAuth()

  // Data
  const [allData, setAllData] = useState<NPSResponse[]>([])
  const [loading, setLoading] = useState(true)

  // View
  const [view, setView] = useState<ViewMode>('dashboard')

  // Filters
  const [weekStart, setWeekStart] = useState<Date>(getCurrentWeekStart())
  const [paisFilter, setPaisFilter] = useState<string>('all')
  const [suscripcionFilter, setSuscripcionFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Table state
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*')
        .order('fecha', { ascending: false })

      if (error) {
        toast.error('Error al cargar respuestas NPS')
        console.error(error)
      } else {
        setAllData(data || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // Dynamic filter options
  const paisOptions = useMemo(() => {
    const set = new Set(allData.map(r => r.pais).filter(Boolean))
    return Array.from(set).sort()
  }, [allData])

  const suscripcionOptions = useMemo(() => {
    const set = new Set(allData.map(r => r.suscripcion).filter(Boolean))
    return Array.from(set).sort()
  }, [allData])

  // Apply base filters (país, suscripción)
  const baseFiltered = useMemo(() => {
    return allData.filter(r => {
      if (paisFilter !== 'all' && r.pais !== paisFilter) return false
      if (suscripcionFilter !== 'all' && r.suscripcion !== suscripcionFilter) return false
      return true
    })
  }, [allData, paisFilter, suscripcionFilter])

  // Week-filtered data
  const weekRange = useMemo(() => getWeekRange(weekStart), [weekStart])

  const weekData = useMemo(() => {
    return baseFiltered.filter(r => r.fecha >= weekRange.start && r.fecha <= weekRange.end)
  }, [baseFiltered, weekRange])

  // Previous week data (for trend)
  const prevWeekData = useMemo(() => {
    const prevStart = new Date(weekStart)
    prevStart.setDate(prevStart.getDate() - 7)
    const prev = getWeekRange(prevStart)
    return baseFiltered.filter(r => r.fecha >= prev.start && r.fecha <= prev.end)
  }, [baseFiltered, weekStart])

  // Month data
  const monthData = useMemo(() => {
    const mr = getMonthRange(weekStart)
    return baseFiltered.filter(r => r.fecha >= mr.start && r.fecha <= mr.end)
  }, [baseFiltered, weekStart])

  // NPS calculations
  const weekNPS = useMemo(() => computeNPS(weekData), [weekData])
  const prevWeekNPS = useMemo(() => computeNPS(prevWeekData), [prevWeekData])
  const monthNPS = useMemo(() => computeNPS(monthData), [monthData])

  const distribution = useMemo(() => {
    if (weekData.length === 0) return { promoters: 0, passives: 0, detractors: 0 }
    const promoters = weekData.filter(r => r.score >= 9).length
    const passives = weekData.filter(r => r.score >= 7 && r.score <= 8).length
    const detractors = weekData.filter(r => r.score <= 6).length
    const total = weekData.length
    return {
      promoters: Math.round((promoters / total) * 100),
      passives: Math.round((passives / total) * 100),
      detractors: Math.round((detractors / total) * 100),
    }
  }, [weekData])

  // Score distribution chart data
  const scoreDistribution = useMemo(() => {
    const counts = Array.from({ length: 11 }, (_, i) => ({ score: i, count: 0 }))
    weekData.forEach(r => {
      if (r.score >= 0 && r.score <= 10) counts[r.score].count++
    })
    return counts
  }, [weekData])

  // NPS trend (last 12 weeks)
  const trendData = useMemo(() => {
    const weeks: { label: string; nps: number | null; npsFiltered?: number | null }[] = []
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(weekStart)
      ws.setDate(ws.getDate() - i * 7)
      const monday = getMonday(ws)
      const wr = getWeekRange(monday)

      // Global (unfiltered by país/suscripción)
      const globalWeek = allData.filter(r => r.fecha >= wr.start && r.fecha <= wr.end)
      const globalNPS = computeNPS(globalWeek)

      const label = monday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

      if (paisFilter !== 'all' || suscripcionFilter !== 'all') {
        const filteredWeek = baseFiltered.filter(r => r.fecha >= wr.start && r.fecha <= wr.end)
        weeks.push({ label, nps: globalNPS, npsFiltered: computeNPS(filteredWeek) })
      } else {
        weeks.push({ label, nps: globalNPS })
      }
    }
    return weeks
  }, [weekStart, allData, baseFiltered, paisFilter, suscripcionFilter])

  // Database view data
  const databaseData = useMemo(() => {
    let filtered = weekData.filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (r.nombre_apellido || '').toLowerCase().includes(q)
      }
      return true
    })

    filtered.sort((a, b) => {
      let cmp = 0
      if (sortField === 'fecha') cmp = a.fecha.localeCompare(b.fecha)
      else if (sortField === 'score') cmp = a.score - b.score
      else if (sortField === 'pais') cmp = (a.pais || '').localeCompare(b.pais || '')
      return sortDir === 'desc' ? -cmp : cmp
    })

    return filtered
  }, [weekData, searchQuery, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(databaseData.length / PAGE_SIZE))
  const pagedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return databaseData.slice(start, start + PAGE_SIZE)
  }, [databaseData, page])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [weekStart, paisFilter, suscripcionFilter, searchQuery, sortField, sortDir])

  // Week navigation
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

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // CSV export
  const exportCSV = useCallback(() => {
    if (databaseData.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }
    const headers = ['Fecha', 'Nombre', 'País', 'Suscripción', 'Score', 'Cómo mejorar', 'Principal beneficio']
    const rows = databaseData.map(r => [
      r.fecha,
      r.nombre_apellido || '',
      r.pais || '',
      r.suscripcion || '',
      String(r.score),
      `"${(r.como_mejorar || '').replace(/"/g, '""')}"`,
      `"${(r.principal_beneficio || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nps_export_${weekRange.start}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }, [databaseData, weekRange.start])

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUpIcon className="w-3 h-3 text-gray-300 inline ml-1" />
    return sortDir === 'asc'
      ? <ChevronUpIcon className="w-3 h-3 text-[#3c527a] inline ml-1" />
      : <ChevronDownIcon className="w-3 h-3 text-[#3c527a] inline ml-1" />
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3c527a]" />
      </div>
    )
  }

  const hasFiltersActive = paisFilter !== 'all' || suscripcionFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header: View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex bg-white rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setView('dashboard')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'dashboard'
                ? 'bg-[#3c527a] text-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView('database')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'database'
                ? 'bg-[#3c527a] text-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Base de datos
          </button>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-[220px] text-center">
          Semana del {formatWeekLabel(weekStart)}
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
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Hoy
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">País</label>
          <select
            value={paisFilter}
            onChange={e => setPaisFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="all">Todos</option>
            {paisOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Suscripción</label>
          <select
            value={suscripcionFilter}
            onChange={e => setSuscripcionFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a]"
          >
            <option value="all">Todas</option>
            {suscripcionOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {view === 'database' && (
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar nombre..."
                className="text-sm border border-gray-200 rounded-md pl-8 pr-3 py-1.5 bg-white text-[#383838] focus:outline-none focus:ring-1 focus:ring-[#3c527a] w-56"
              />
            </div>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-sm font-medium text-[#3c527a] border border-[#3c527a] rounded-md px-3 py-1.5 hover:bg-[#3c527a] hover:text-white transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        )}
      </div>

      {/* =================== DASHBOARD VIEW =================== */}
      {view === 'dashboard' && (
        <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* NPS Score */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS de la semana</p>
              <div className="flex items-end gap-2">
                <span
                  className={`text-3xl font-bold ${
                    weekNPS === null ? 'text-gray-300' : weekNPS > 0 ? 'text-green-600' : weekNPS < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {weekNPS !== null ? weekNPS : '—'}
                </span>
                {weekNPS !== null && prevWeekNPS !== null && (
                  <span
                    className={`flex items-center text-xs font-medium mb-1 ${
                      weekNPS >= prevWeekNPS ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {weekNPS >= prevWeekNPS ? (
                      <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-0.5" />
                    ) : (
                      <ArrowTrendingDownIcon className="w-3.5 h-3.5 mr-0.5" />
                    )}
                    {weekNPS - prevWeekNPS > 0 ? '+' : ''}
                    {weekNPS - prevWeekNPS}
                  </span>
                )}
              </div>
            </div>

            {/* Total respuestas */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Respuestas de la semana</p>
              <span className="text-3xl font-bold text-[#383838]">{weekData.length}</span>
            </div>

            {/* Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Distribución</p>
              {weekData.length === 0 ? (
                <span className="text-sm text-gray-400">Sin datos</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.promoters}% Prom.
                  </span>
                  <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.passives}% Pas.
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2.5 py-0.5 text-xs font-medium">
                    {distribution.detractors}% Det.
                  </span>
                </div>
              )}
            </div>

            {/* NPS acumulado del mes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">NPS acumulado del mes</p>
              <span
                className={`text-3xl font-bold ${
                  monthNPS === null ? 'text-gray-300' : monthNPS > 0 ? 'text-green-600' : monthNPS < 0 ? 'text-red-600' : 'text-gray-600'
                }`}
              >
                {monthNPS !== null ? monthNPS : '—'}
              </span>
              {monthNPS !== null && (
                <p className="text-xs text-gray-400 mt-1">{monthData.length} respuestas</p>
              )}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-[#383838] mb-4">Distribución de scores</h3>
              {weekData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Sin datos para esta semana</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scoreDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number) => [value, 'Respuestas']}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {scoreDistribution.map((entry) => (
                        <Cell key={entry.score} fill={scoreBarColor(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* NPS trend */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-[#383838] mb-4">Tendencia NPS (12 semanas)</h3>
              {trendData.every(d => d.nps === null) ? (
                <p className="text-sm text-gray-400 text-center py-10">Sin datos suficientes</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="nps"
                      name="NPS Global"
                      stroke="#3c527a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    {hasFiltersActive && (
                      <Line
                        type="monotone"
                        dataKey="npsFiltered"
                        name="NPS Filtrado"
                        stroke="#ff8080"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                        strokeDasharray="5 3"
                      />
                    )}
                    {hasFiltersActive && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* AI Summary placeholder */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#383838] flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-purple-500" />
                Resumen IA
              </h3>
              <div className="relative group">
                <button
                  disabled
                  className="text-xs font-medium bg-gray-100 text-gray-400 rounded-md px-3 py-1.5 cursor-not-allowed"
                >
                  Analizar
                </button>
                <span className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                  Próximamente
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center py-8 text-gray-300 text-sm">
              El análisis de IA de las respuestas NPS aparecerá aquí
            </div>
          </div>
        </div>
      )}

      {/* =================== DATABASE VIEW =================== */}
      {view === 'database' && (
        <div className="space-y-4">
          {databaseData.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-gray-400 text-sm">Sin datos para esta semana</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th
                          onClick={() => handleSort('fecha')}
                          className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-[#3c527a] select-none"
                        >
                          Fecha <SortIcon field="fecha" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                        <th
                          onClick={() => handleSort('pais')}
                          className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-[#3c527a] select-none"
                        >
                          País <SortIcon field="pais" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Suscripción</th>
                        <th
                          onClick={() => handleSort('score')}
                          className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-[#3c527a] select-none"
                        >
                          Score <SortIcon field="score" />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Cómo mejorar</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Principal beneficio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedData.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {formatDateShort(r.fecha)}
                          </td>
                          <td className="px-4 py-3 text-[#383838] font-medium max-w-[180px] truncate">
                            {r.nombre_apellido || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.pais || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{r.suscripcion || '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold min-w-[28px] ${scoreBadgeClasses(r.score)}`}
                            >
                              {r.score}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-[250px] truncate" title={r.como_mejorar || ''}>
                            {r.como_mejorar || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-[250px] truncate" title={r.principal_beneficio || ''}>
                            {r.principal_beneficio || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{databaseData.length} resultados</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={`text-sm font-medium px-3 py-1 rounded-md border border-gray-200 transition-colors ${
                      page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 text-[#383838]'
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
                    className={`text-sm font-medium px-3 py-1 rounded-md border border-gray-200 transition-colors ${
                      page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 text-[#383838]'
                    }`}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
