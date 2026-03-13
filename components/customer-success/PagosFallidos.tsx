'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  PhoneIcon,
  EnvelopeIcon,
  FunnelIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// --------------- Types ---------------

interface PaymentFailed {
  id: string
  bubble_id: string
  correo: string
  nombre: string
  pais: string
  suscripcion: string
  telefono: string
  monto_pago: number | null
  fecha_pago_fallido: string
  synced_at: string
  whatsapp_url: string | null
}

interface PaymentGestion {
  id: string
  payment_failed_id: string
  agente_id: string
  fecha_contacto: string
  canal: 'whatsapp' | 'llamada' | 'email'
  comentario: string
  estado: 'pendiente' | 'en_gestion' | 'resuelto' | 'no_contactado'
  exitoso: boolean
  plan_comprado: string | null
  monto_recuperado: number | null
  es_cierre: boolean
  created_at: string
}

interface GroupedUser {
  correo: string
  nombre: string
  pais: string
  suscripcion: string
  telefono: string
  whatsapp_url: string | null
  failures: PaymentFailed[]
  gestiones: PaymentGestion[]
  intentos: number
  lastMonto: number | null
  lastFecha: string
  estado: 'pendiente' | 'en_gestion' | 'resuelto' | 'no_contactado'
  isClosed: boolean
}

type SortField = 'intentos' | 'fecha' | 'estado'
type SubTab = 'resumen' | 'gestion'
type DateQuickFilter = 'hoy' | 'semana' | 'mes' | 'todo'

// --------------- Helpers ---------------

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_gestion: 'En gestión',
  resuelto: 'Resuelto',
  no_contactado: 'No contactado',
}

const ESTADO_COLORS: Record<string, { bg: string; text: string }> = {
  pendiente: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  en_gestion: { bg: 'bg-blue-100', text: 'text-blue-800' },
  resuelto: { bg: 'bg-green-100', text: 'text-green-800' },
  no_contactado: { bg: 'bg-gray-100', text: 'text-gray-600' },
}

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  email: 'Email',
}

function fmtUSD(n: number | null | undefined) {
  return '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(): Date {
  const d = new Date()
  const day = d.getDay() // 0=Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function normalizePhone(tel: string, pais?: string): string {
  const digits = tel.replace(/[^0-9]/g, '')
  if (digits.startsWith('51') || digits.startsWith('52') || digits.startsWith('54') ||
      digits.startsWith('55') || digits.startsWith('56') || digits.startsWith('57') ||
      digits.startsWith('593')) {
    return digits
  }
  const prefixes: Record<string, string> = {
    'Perú': '51', 'Peru': '51', 'México': '52', 'Mexico': '52',
    'Chile': '56', 'Colombia': '57', 'Argentina': '54', 'Brasil': '55',
    'Ecuador': '593',
  }
  const prefix = (pais && prefixes[pais]) || ''
  return prefix + digits
}

// WhatsApp SVG icon component
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// --------------- Component ---------------

export default function PagosFallidos() {
  const { supabase, user } = useAuth()

  // Data
  const [failures, setFailures] = useState<PaymentFailed[]>([])
  const [gestiones, setGestiones] = useState<PaymentGestion[]>([])
  const [agentNames, setAgentNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Sub-tab
  const [subTab, setSubTab] = useState<SubTab>('gestion')

  // Filters
  const [filterPais, setFilterPais] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [dateQuickFilter, setDateQuickFilter] = useState<DateQuickFilter>('hoy')
  const [showFilters, setShowFilters] = useState(false)

  // Sort & Pagination
  const [sortField, setSortField] = useState<SortField>('intentos')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20

  // Drawer
  const [drawerUser, setDrawerUser] = useState<GroupedUser | null>(null)

  // New gestion form
  const [newCanal, setNewCanal] = useState<'whatsapp' | 'llamada' | 'email'>('whatsapp')
  const [newComentario, setNewComentario] = useState('')
  const [newEstado, setNewEstado] = useState<'en_gestion' | 'no_contactado'>('en_gestion')
  const [submitting, setSubmitting] = useState(false)

  // Close case form
  const [cierreExitoso, setCierreExitoso] = useState(false)
  const [cierrePlan, setCierrePlan] = useState('')
  const [cierreMonto, setCierreMonto] = useState('')
  const [cierreComentario, setCierreComentario] = useState('')
  const [closingCase, setClosingCase] = useState(false)

  // --------------- Fetch ---------------

  const fetchData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [failRes, gestRes] = await Promise.all([
        supabase.from('payment_failed').select('*').order('fecha_pago_fallido', { ascending: false }),
        supabase.from('payment_gestiones').select('*').order('created_at', { ascending: true }),
      ])
      if (failRes.error) throw failRes.error
      if (gestRes.error) throw gestRes.error
      setFailures(failRes.data || [])
      setGestiones(gestRes.data || [])

      // Fetch agent names for display in gestiones history
      const agentIds = [...new Set((gestRes.data || []).map((g: PaymentGestion) => g.agente_id))]
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', agentIds)
        if (profiles) {
          const names: Record<string, string> = {}
          for (const p of profiles) {
            names[p.id] = p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : p.email || 'Agente'
          }
          setAgentNames(names)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cargando datos'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // --------------- Group by correo ---------------

  const grouped = useMemo<GroupedUser[]>(() => {
    const map = new Map<string, GroupedUser>()

    for (const f of failures) {
      if (!map.has(f.correo)) {
        map.set(f.correo, {
          correo: f.correo,
          nombre: f.nombre,
          pais: f.pais,
          suscripcion: f.suscripcion,
          telefono: f.telefono,
          whatsapp_url: f.whatsapp_url,
          failures: [],
          gestiones: [],
          intentos: 0,
          lastMonto: null,
          lastFecha: '',
          estado: 'pendiente',
          isClosed: false,
        })
      }
      const g = map.get(f.correo)!
      g.failures.push(f)
    }

    for (const [, group] of map) {
      group.failures.sort((a, b) => new Date(b.fecha_pago_fallido).getTime() - new Date(a.fecha_pago_fallido).getTime())
      group.intentos = group.failures.length
      group.lastMonto = group.failures[0]?.monto_pago ?? null
      group.lastFecha = group.failures[0]?.fecha_pago_fallido || ''
      const latest = group.failures[0]
      if (latest) {
        group.nombre = latest.nombre || group.nombre
        group.pais = latest.pais || group.pais
        group.suscripcion = latest.suscripcion || group.suscripcion
        group.telefono = latest.telefono || group.telefono
        group.whatsapp_url = latest.whatsapp_url || group.whatsapp_url
      }

      const failedIds = new Set(group.failures.map(f => f.id))
      group.gestiones = gestiones.filter(g => failedIds.has(g.payment_failed_id))

      const cierre = group.gestiones.find(g => g.es_cierre)
      if (cierre) {
        group.estado = 'resuelto'
        group.isClosed = true
      } else if (group.gestiones.length > 0) {
        const lastGestion = group.gestiones[group.gestiones.length - 1]
        group.estado = lastGestion.estado as GroupedUser['estado']
      } else {
        group.estado = 'pendiente'
      }
    }

    return Array.from(map.values())
  }, [failures, gestiones])

  // --------------- Unique filter values ---------------

  const paises = useMemo(() => [...new Set(failures.map(f => f.pais).filter(Boolean))].sort(), [failures])

  // --------------- Date range from quick filter ---------------

  const dateRange = useMemo(() => {
    const now = new Date()
    switch (dateQuickFilter) {
      case 'hoy': return { from: startOfToday().getTime(), to: now.getTime() + 86400000 }
      case 'semana': return { from: startOfWeek().getTime(), to: now.getTime() + 86400000 }
      case 'mes': return { from: startOfMonth().getTime(), to: now.getTime() + 86400000 }
      case 'todo': return { from: 0, to: Infinity }
    }
  }, [dateQuickFilter])

  // --------------- Filter & Sort ---------------

  const filtered = useMemo(() => {
    let result = grouped

    if (filterPais) result = result.filter(g => g.pais === filterPais)
    if (filterEstado) result = result.filter(g => g.estado === filterEstado)

    // Date filter (applies to Gestión tab)
    if (dateQuickFilter !== 'todo') {
      result = result.filter(g => {
        if (!g.lastFecha) return false
        const t = new Date(g.lastFecha).getTime()
        return t >= dateRange.from && t < dateRange.to
      })
    }

    result = [...result]
    if (sortField === 'intentos') {
      result.sort((a, b) => b.intentos - a.intentos)
    } else if (sortField === 'fecha') {
      result.sort((a, b) => new Date(b.lastFecha).getTime() - new Date(a.lastFecha).getTime())
    } else if (sortField === 'estado') {
      const order: Record<string, number> = { pendiente: 0, no_contactado: 1, en_gestion: 2, resuelto: 3 }
      result.sort((a, b) => (order[a.estado] ?? 0) - (order[b.estado] ?? 0))
    }

    return result
  }, [grouped, filterPais, filterEstado, dateQuickFilter, dateRange, sortField])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [filterPais, filterEstado, dateQuickFilter, sortField])

  // --------------- Pagination ---------------

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  // --------------- Metrics ---------------

  const metrics = useMemo(() => {
    const weekStart = startOfWeek().getTime()
    const monthStart = startOfMonth().getTime()
    const todayStart = startOfToday().getTime()

    const activeCases = grouped.filter(g => !g.isClosed)
    const casosHoy = grouped.filter(g =>
      g.failures.some(f => new Date(f.fecha_pago_fallido).getTime() >= todayStart)
    )
    const nuevosEstaSemana = grouped.filter(g =>
      g.failures.some(f => new Date(f.fecha_pago_fallido).getTime() >= weekStart)
    )
    const gestionadosEstaSemana = grouped.filter(g =>
      g.gestiones.some(ge => new Date(ge.created_at).getTime() >= weekStart)
    )

    const pendientes = grouped.filter(g => g.estado === 'pendiente')

    const allGestionesThisMonth = gestiones.filter(g => new Date(g.created_at).getTime() >= monthStart)
    const montoRecuperado = allGestionesThisMonth
      .filter(g => g.exitoso && g.monto_recuperado)
      .reduce((sum, g) => sum + (g.monto_recuperado || 0), 0)

    const closedThisMonth = allGestionesThisMonth.filter(g => g.es_cierre)
    const successfulThisMonth = closedThisMonth.filter(g => g.exitoso)
    const tasaConversion = closedThisMonth.length > 0
      ? (successfulThisMonth.length / closedThisMonth.length) * 100
      : 0

    return {
      activos: activeCases.length,
      casosHoy: casosHoy.length,
      nuevos: nuevosEstaSemana.length,
      gestionados: gestionadosEstaSemana.length,
      pendientes: pendientes.length,
      montoRecuperado,
      tasaConversion,
      totalCasos: grouped.length,
    }
  }, [grouped, gestiones])

  // --------------- Weekly trend (last 12 weeks) ---------------

  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; fallidos: number; gestionados: number; exitosos: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const ws = new Date(now)
      ws.setDate(ws.getDate() - i * 7)
      // Week starts Sunday
      const dayOfWeek = ws.getDay()
      const sun = new Date(ws)
      sun.setDate(sun.getDate() - dayOfWeek)
      sun.setHours(0, 0, 0, 0)
      const sat = new Date(sun)
      sat.setDate(sat.getDate() + 6)
      sat.setHours(23, 59, 59, 999)
      const wStart = sun.getTime()
      const wEnd = sat.getTime()

      const fallidos = new Set<string>()
      for (const f of failures) {
        const t = new Date(f.fecha_pago_fallido).getTime()
        if (t >= wStart && t <= wEnd) fallidos.add(f.correo)
      }

      const gestionadosSet = new Set<string>()
      const exitososSet = new Set<string>()
      for (const g of gestiones) {
        const t = new Date(g.created_at).getTime()
        if (t >= wStart && t <= wEnd) {
          gestionadosSet.add(g.payment_failed_id)
          if (g.es_cierre && g.exitoso) exitososSet.add(g.payment_failed_id)
        }
      }

      weeks.push({
        label: sun.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        fallidos: fallidos.size,
        gestionados: gestionadosSet.size,
        exitosos: exitososSet.size,
      })
    }
    return weeks
  }, [failures, gestiones])

  // --------------- Actions ---------------

  async function handleNewGestion() {
    if (!supabase || !user || !drawerUser) return
    if (!newComentario.trim()) {
      toast.error('Agrega un comentario')
      return
    }
    setSubmitting(true)
    try {
      const latestFailure = drawerUser.failures[0]
      if (!latestFailure) throw new Error('No hay pago fallido asociado')

      const { error } = await supabase.from('payment_gestiones').insert({
        payment_failed_id: latestFailure.id,
        agente_id: user.id,
        canal: newCanal,
        comentario: newComentario.trim(),
        estado: newEstado,
        exitoso: false,
        es_cierre: false,
      })
      if (error) throw error

      toast.success('Gestión registrada')
      setNewComentario('')
      setNewCanal('whatsapp')
      setNewEstado('en_gestion')
      await fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error guardando gestión'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseCase() {
    if (!supabase || !user || !drawerUser) return
    if (!cierreComentario.trim()) {
      toast.error('Agrega un comentario de cierre')
      return
    }
    if (cierreExitoso && !cierrePlan.trim()) {
      toast.error('Indica el plan comprado')
      return
    }
    setClosingCase(true)
    try {
      const latestFailure = drawerUser.failures[0]
      if (!latestFailure) throw new Error('No hay pago fallido asociado')

      const { error } = await supabase.from('payment_gestiones').insert({
        payment_failed_id: latestFailure.id,
        agente_id: user.id,
        canal: 'whatsapp',
        comentario: cierreComentario.trim(),
        estado: 'resuelto',
        exitoso: cierreExitoso,
        plan_comprado: cierreExitoso ? cierrePlan.trim() : null,
        monto_recuperado: cierreExitoso ? parseFloat(cierreMonto) || 0 : null,
        es_cierre: true,
      })
      if (error) throw error

      toast.success('Caso cerrado exitosamente')
      setCierreExitoso(false)
      setCierrePlan('')
      setCierreMonto('')
      setCierreComentario('')
      await fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error cerrando caso'
      toast.error(msg)
    } finally {
      setClosingCase(false)
    }
  }

  // Keep drawer user in sync after data refetch
  useEffect(() => {
    if (drawerUser) {
      const updated = grouped.find(g => g.correo === drawerUser.correo)
      if (updated) setDrawerUser(updated)
    }
  }, [grouped]) // eslint-disable-line react-hooks/exhaustive-deps

  function openDrawer(u: GroupedUser) {
    setDrawerUser(u)
    setNewComentario('')
    setNewCanal('whatsapp')
    setNewEstado('en_gestion')
    setCierreExitoso(false)
    setCierrePlan('')
    setCierreMonto('')
    setCierreComentario('')
  }

  function getWhatsAppLink(g: GroupedUser): string | null {
    if (g.whatsapp_url) return g.whatsapp_url
    if (g.telefono) {
      const phone = normalizePhone(g.telefono, g.pais)
      return `https://wa.me/${phone}`
    }
    return null
  }

  // --------------- Render ---------------

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setSubTab('gestion')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            subTab === 'gestion' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardDocumentListIcon className="w-4 h-4" />
          Gestión
        </button>
        <button
          onClick={() => setSubTab('resumen')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            subTab === 'resumen' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ChartBarIcon className="w-4 h-4" />
          Resumen
        </button>
      </div>

      {/* ==================== RESUMEN TAB ==================== */}
      {subTab === 'resumen' && (
        <div className="space-y-4">
          {/* Compact KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniMetricCard label="Casos activos" value={metrics.activos} color="text-red-600" loading={loading} />
            <MiniMetricCard label="Pendientes" value={metrics.pendientes} color="text-yellow-600" loading={loading} />
            <MiniMetricCard label="Hoy" value={metrics.casosHoy} color="text-orange-600" loading={loading} />
            <MiniMetricCard label="Nuevos (semana)" value={metrics.nuevos} color="text-blue-600" loading={loading} />
            <MiniMetricCard label="Gestionados (semana)" value={metrics.gestionados} color="text-indigo-600" loading={loading} />
            <MiniMetricCard label="Total histórico" value={metrics.totalCasos} color="text-gray-600" loading={loading} />
          </div>

          {/* Recovery metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Monto recuperado (mes)</p>
                  <p className="text-xl font-bold text-gray-900">{loading ? '...' : fmtUSD(metrics.montoRecuperado)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50">
                  <CheckCircleIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tasa de conversión (mes)</p>
                  <p className="text-xl font-bold text-gray-900">{loading ? '...' : `${metrics.tasaConversion.toFixed(1)}%`}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Estado breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribución por estado</h3>
            <div className="space-y-2">
              {(['pendiente', 'en_gestion', 'no_contactado', 'resuelto'] as const).map(estado => {
                const count = grouped.filter(g => g.estado === estado).length
                const pct = grouped.length > 0 ? (count / grouped.length) * 100 : 0
                const ec = ESTADO_COLORS[estado]
                return (
                  <div key={estado} className="flex items-center gap-3">
                    <span className={`text-xs font-medium w-28 ${ec.text}`}>{ESTADO_LABELS[estado]}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${ec.bg} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Weekly trend chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Tendencia semanal (últimas 12 semanas)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="fallidos" name="Pagos fallidos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="gestionados" name="Gestionados" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="exitosos" name="Recuperados" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top countries */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Casos por país</h3>
            <div className="space-y-1.5">
              {(() => {
                const countryCounts = new Map<string, number>()
                for (const g of grouped) {
                  const p = g.pais || 'Sin país'
                  countryCounts.set(p, (countryCounts.get(p) || 0) + 1)
                }
                return [...countryCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([pais, count]) => (
                    <div key={pais} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-gray-50">
                      <span className="text-gray-700">{pais}</span>
                      <span className="text-gray-500 font-medium">{count}</span>
                    </div>
                  ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ==================== GESTIÓN TAB ==================== */}
      {subTab === 'gestion' && (
        <div className="space-y-3">
          {/* Compact top stats */}
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-gray-500">Activos:</span>
              <span className="font-semibold text-gray-900">{metrics.activos}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-gray-500">Pendientes:</span>
              <span className="font-semibold text-gray-900">{metrics.pendientes}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-gray-500">Hoy:</span>
              <span className="font-semibold text-gray-900">{metrics.casosHoy}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-gray-500">Recuperado:</span>
              <span className="font-semibold text-gray-900">{fmtUSD(metrics.montoRecuperado)}</span>
            </span>
          </div>

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {/* Date quick filters */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  {([
                    { key: 'hoy', label: 'Hoy' },
                    { key: 'semana', label: 'Semana' },
                    { key: 'mes', label: 'Mes' },
                    { key: 'todo', label: 'Todo' },
                  ] as { key: DateQuickFilter; label: string }[]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setDateQuickFilter(key)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        dateQuickFilter === key
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  <FunnelIcon className="w-3.5 h-3.5" />
                  Filtros
                  {(filterPais || filterEstado) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{filtered.length} casos</span>
                <span className="text-gray-300">|</span>
                <select
                  value={sortField}
                  onChange={e => setSortField(e.target.value as SortField)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="intentos">Más intentos</option>
                  <option value="fecha">Más recientes</option>
                  <option value="estado">Por estado</option>
                </select>
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t border-gray-100">
                <select
                  value={filterPais}
                  onChange={e => setFilterPais(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="">Todos los países</option>
                  {paises.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                  value={filterEstado}
                  onChange={e => setFilterEstado(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value="">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_gestion">En gestión</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="no_contactado">No contactado</option>
                </select>
                {(filterPais || filterEstado) && (
                  <button
                    onClick={() => { setFilterPais(''); setFilterEstado('') }}
                    className="text-xs text-red-500 hover:text-red-700 underline px-1"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Compact table — 6 columns */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <ExclamationTriangleIcon className="w-8 h-8 mb-2" />
                <p className="text-sm">No se encontraron casos{dateQuickFilter === 'hoy' ? ' para hoy' : ''}</p>
                {dateQuickFilter === 'hoy' && (
                  <button
                    onClick={() => setDateQuickFilter('todo')}
                    className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline"
                  >
                    Ver todos los casos
                  </button>
                )}
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-4 py-2.5 font-medium">Usuario</th>
                      <th className="px-3 py-2.5 font-medium">País</th>
                      <th className="px-3 py-2.5 font-medium text-center">Intentos</th>
                      <th className="px-3 py-2.5 font-medium">Fecha</th>
                      <th className="px-3 py-2.5 font-medium">Estado</th>
                      <th className="px-3 py-2.5 font-medium text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(g => {
                      const ec = ESTADO_COLORS[g.estado] || ESTADO_COLORS.pendiente
                      const waLink = getWhatsAppLink(g)
                      return (
                        <tr key={g.correo} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate text-sm">{g.nombre || '—'}</p>
                              <p className="text-xs text-gray-400 truncate">{g.correo}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 text-xs">{g.pais || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              g.intentos >= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {g.intentos}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                            {g.lastFecha ? fmtDate(g.lastFecha) : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ec.bg} ${ec.text}`}>
                              {ESTADO_LABELS[g.estado]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              {waLink && (
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                                  title="Abrir WhatsApp"
                                >
                                  <WhatsAppIcon className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => openDrawer(g)}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                                style={{ backgroundColor: '#3c527a' }}
                              >
                                Gestionar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('dots')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) =>
                        p === 'dots' ? (
                          <span key={`dots-${i}`} className="px-1 text-xs text-gray-400">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p as number)}
                            className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                              currentPage === p
                                ? 'text-white'
                                : 'text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                            style={currentPage === p ? { backgroundColor: '#3c527a' } : undefined}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Drawer backdrop */}
      {drawerUser && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setDrawerUser(null)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 transform transition-transform duration-300 ${
          drawerUser ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {drawerUser && (
          <div className="flex flex-col h-full">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Gestión de caso</h2>
                {drawerUser.isClosed && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    Caso cerrado
                  </span>
                )}
              </div>
              <button
                onClick={() => setDrawerUser(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* User info */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Información del usuario</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400">Nombre</span>
                    <p className="font-medium text-gray-900">{drawerUser.nombre || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Correo</span>
                    <p className="font-medium text-gray-900 break-all">{drawerUser.correo}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Teléfono</span>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{drawerUser.telefono || '—'}</p>
                      {(() => {
                        const link = getWhatsAppLink(drawerUser)
                        return link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-700"
                            title="Abrir WhatsApp"
                          >
                            <WhatsAppIcon className="w-4 h-4" />
                          </a>
                        ) : null
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">País</span>
                    <p className="font-medium text-gray-900">{drawerUser.pais || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Suscripción</span>
                    <p className="font-medium text-gray-900">{drawerUser.suscripcion || '—'}</p>
                  </div>
                </div>
              </section>

              {/* Failed payment timeline */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Pagos fallidos ({drawerUser.failures.length})
                </h3>
                <div className="space-y-2">
                  {drawerUser.failures.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 bg-red-50 rounded-lg text-sm">
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">
                        {drawerUser.failures.length - i}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-600 text-xs">{fmtDate(f.fecha_pago_fallido)}</p>
                        <p className="text-xs text-gray-400">{f.suscripcion}</p>
                      </div>
                      {f.monto_pago != null && (
                        <span className="font-semibold text-red-700 whitespace-nowrap text-xs">{fmtUSD(f.monto_pago)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Gestiones history */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Historial de gestiones ({drawerUser.gestiones.length})
                </h3>
                {drawerUser.gestiones.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Sin gestiones registradas</p>
                ) : (
                  <div className="space-y-3">
                    {drawerUser.gestiones.map(ge => {
                      const ec = ESTADO_COLORS[ge.estado] || ESTADO_COLORS.pendiente
                      return (
                        <div key={ge.id} className={`p-3 rounded-lg border text-sm ${ge.es_cierre ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {ge.canal === 'whatsapp' ? (
                                <WhatsAppIcon className="w-4 h-4 text-green-600" />
                              ) : ge.canal === 'llamada' ? (
                                <PhoneIcon className="w-4 h-4 text-gray-500" />
                              ) : (
                                <EnvelopeIcon className="w-4 h-4 text-gray-500" />
                              )}
                              <span className="font-medium text-gray-700">{CANAL_LABELS[ge.canal] || ge.canal}</span>
                              {ge.es_cierre && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">Cierre</span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ec.bg} ${ec.text}`}>
                              {ESTADO_LABELS[ge.estado]}
                            </span>
                          </div>
                          <p className="text-gray-700 mb-1.5">{ge.comentario}</p>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{agentNames[ge.agente_id] || 'Agente'}</span>
                            <span>{fmtDateTime(ge.created_at)}</span>
                          </div>
                          {ge.es_cierre && ge.exitoso && (
                            <div className="mt-2 pt-2 border-t border-green-200 text-xs">
                              <span className="text-green-700 font-medium">
                                Plan: {ge.plan_comprado} | Recuperado: {fmtUSD(ge.monto_recuperado)}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* New gestion form */}
              {!drawerUser.isClosed && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Nueva gestión</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Canal</label>
                      <select
                        value={newCanal}
                        onChange={e => setNewCanal(e.target.value as 'whatsapp' | 'llamada' | 'email')}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="llamada">Llamada</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Comentario</label>
                      <textarea
                        value={newComentario}
                        onChange={e => setNewComentario(e.target.value)}
                        rows={3}
                        placeholder="Describe la gestión realizada..."
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Estado</label>
                      <select
                        value={newEstado}
                        onChange={e => setNewEstado(e.target.value as 'en_gestion' | 'no_contactado')}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      >
                        <option value="en_gestion">En gestión</option>
                        <option value="no_contactado">No contactado</option>
                      </select>
                    </div>
                    <button
                      onClick={handleNewGestion}
                      disabled={submitting}
                      className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 hover:opacity-90"
                      style={{ backgroundColor: '#3c527a' }}
                    >
                      {submitting ? 'Guardando...' : 'Registrar gestión'}
                    </button>
                  </div>
                </section>
              )}

              {/* Close case form */}
              {!drawerUser.isClosed && (
                <section className="border-t border-gray-200 pt-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cerrar caso</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cierreExitoso}
                        onChange={e => setCierreExitoso(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Recuperación exitosa</span>
                    </label>
                    {cierreExitoso && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Plan comprado</label>
                          <input
                            type="text"
                            value={cierrePlan}
                            onChange={e => setCierrePlan(e.target.value)}
                            placeholder="Ej: Mensual, Anual..."
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Monto recuperado (USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={cierreMonto}
                            onChange={e => setCierreMonto(e.target.value)}
                            placeholder="0.00"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Comentario de cierre</label>
                      <textarea
                        value={cierreComentario}
                        onChange={e => setCierreComentario(e.target.value)}
                        rows={2}
                        placeholder="Motivo del cierre..."
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                      />
                    </div>
                    <button
                      onClick={handleCloseCase}
                      disabled={closingCase}
                      className={`w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                        cierreExitoso ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      {closingCase ? 'Cerrando...' : cierreExitoso ? 'Cerrar como exitoso' : 'Cerrar sin recuperación'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --------------- Sub-components ---------------

function MiniMetricCard({
  label,
  value,
  color,
  loading,
}: {
  label: string
  value: number
  color: string
  loading?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{loading ? '...' : value}</p>
    </div>
  )
}
