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
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  EnvelopeIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

// --------------- Types ---------------

interface PaymentFailed {
  id: string
  bubble_id: string
  correo: string
  nombre: string
  pais: string
  suscripcion: string
  telefono: string
  monto_pago: number
  fecha_pago_fallido: string
  synced_at: string
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
  failures: PaymentFailed[]
  gestiones: PaymentGestion[]
  intentos: number
  lastMonto: number
  lastFecha: string
  estado: 'pendiente' | 'en_gestion' | 'resuelto' | 'no_contactado'
  isClosed: boolean
}

type SortField = 'intentos' | 'fecha' | 'estado'

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

const CANAL_ICONS: Record<string, React.ElementType> = {
  whatsapp: ChatBubbleLeftRightIcon,
  llamada: PhoneIcon,
  email: EnvelopeIcon,
}

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  email: 'Email',
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function startOfWeek(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function startOfMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// --------------- Component ---------------

export default function PagosFallidos() {
  const { supabase, user } = useAuth()

  // Data
  const [failures, setFailures] = useState<PaymentFailed[]>([])
  const [gestiones, setGestiones] = useState<PaymentGestion[]>([])
  const [agentNames, setAgentNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterPais, setFilterPais] = useState('')
  const [filterSuscripcion, setFilterSuscripcion] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSinGestiones, setFilterSinGestiones] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Sort
  const [sortField, setSortField] = useState<SortField>('fecha')

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
          failures: [],
          gestiones: [],
          intentos: 0,
          lastMonto: 0,
          lastFecha: '',
          estado: 'pendiente',
          isClosed: false,
        })
      }
      const g = map.get(f.correo)!
      g.failures.push(f)
    }

    // Attach gestiones and compute estado
    for (const [, group] of map) {
      group.failures.sort((a, b) => new Date(b.fecha_pago_fallido).getTime() - new Date(a.fecha_pago_fallido).getTime())
      group.intentos = group.failures.length
      group.lastMonto = group.failures[0]?.monto_pago || 0
      group.lastFecha = group.failures[0]?.fecha_pago_fallido || ''
      // Use data from the latest failure record
      const latest = group.failures[0]
      if (latest) {
        group.nombre = latest.nombre || group.nombre
        group.pais = latest.pais || group.pais
        group.suscripcion = latest.suscripcion || group.suscripcion
        group.telefono = latest.telefono || group.telefono
      }

      const failedIds = new Set(group.failures.map(f => f.id))
      group.gestiones = gestiones.filter(g => failedIds.has(g.payment_failed_id))

      // Determine estado: cierre > last gestion estado > pendiente
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
  const suscripciones = useMemo(() => [...new Set(failures.map(f => f.suscripcion).filter(Boolean))].sort(), [failures])

  // --------------- Filter & Sort ---------------

  const filtered = useMemo(() => {
    let result = grouped

    if (filterPais) result = result.filter(g => g.pais === filterPais)
    if (filterSuscripcion) result = result.filter(g => g.suscripcion === filterSuscripcion)
    if (filterEstado) result = result.filter(g => g.estado === filterEstado)
    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime()
      result = result.filter(g => new Date(g.lastFecha).getTime() >= from)
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo).getTime() + 86400000
      result = result.filter(g => new Date(g.lastFecha).getTime() < to)
    }
    if (filterSinGestiones) result = result.filter(g => g.gestiones.length === 0)

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
  }, [grouped, filterPais, filterSuscripcion, filterEstado, filterDateFrom, filterDateTo, filterSinGestiones, sortField])

  // --------------- Metrics ---------------

  const metrics = useMemo(() => {
    const weekStart = startOfWeek().getTime()
    const monthStart = startOfMonth().getTime()

    const activeCases = grouped.filter(g => !g.isClosed)
    const nuevosEstaSemana = grouped.filter(g =>
      g.failures.some(f => new Date(f.fecha_pago_fallido).getTime() >= weekStart)
    )
    const gestionadosEstaSemana = grouped.filter(g =>
      g.gestiones.some(ge => new Date(ge.created_at).getTime() >= weekStart)
    )

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
      nuevos: nuevosEstaSemana.length,
      gestionados: gestionadosEstaSemana.length,
      montoRecuperado,
      tasaConversion,
    }
  }, [grouped, gestiones])

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

  // --------------- Render ---------------

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Casos activos"
          value={metrics.activos.toString()}
          icon={ExclamationTriangleIcon}
          color="bg-red-50 text-red-600"
          loading={loading}
        />
        <MetricCard
          title="Nuevos esta semana"
          value={metrics.nuevos.toString()}
          icon={UserGroupIcon}
          color="bg-orange-50 text-orange-600"
          loading={loading}
        />
        <MetricCard
          title="Gestionados esta semana"
          value={metrics.gestionados.toString()}
          icon={ClockIcon}
          color="bg-blue-50 text-blue-600"
          loading={loading}
        />
        <MetricCard
          title="Monto recuperado (mes)"
          value={fmtUSD(metrics.montoRecuperado)}
          icon={CurrencyDollarIcon}
          color="bg-green-50 text-green-600"
          loading={loading}
        />
        <MetricCard
          title="Tasa conversión (mes)"
          value={`${metrics.tasaConversion.toFixed(1)}%`}
          icon={CheckCircleIcon}
          color="bg-purple-50 text-purple-600"
          loading={loading}
        />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <FunnelIcon className="w-4 h-4" />
            Filtros
            {(filterPais || filterSuscripcion || filterEstado || filterDateFrom || filterDateTo || filterSinGestiones) && (
              <span className="w-2 h-2 rounded-full bg-red-400" />
            )}
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{filtered.length} casos</span>
            <span className="text-gray-300">|</span>
            <span>Ordenar:</span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as SortField)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="fecha">Fecha</option>
              <option value="intentos">Intentos</option>
              <option value="estado">Estado</option>
            </select>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
            <select
              value={filterPais}
              onChange={e => setFilterPais(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Todos los países</option>
              {paises.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={filterSuscripcion}
              onChange={e => setFilterSuscripcion(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Todas las suscripciones</option>
              {suscripciones.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterEstado}
              onChange={e => setFilterEstado(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_gestion">En gestión</option>
              <option value="resuelto">Resuelto</option>
              <option value="no_contactado">No contactado</option>
            </select>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSinGestiones}
                onChange={e => setFilterSinGestiones(e.target.checked)}
                className="rounded border-gray-300"
              />
              Solo sin gestiones
            </label>
            <button
              onClick={() => {
                setFilterPais('')
                setFilterSuscripcion('')
                setFilterEstado('')
                setFilterDateFrom('')
                setFilterDateTo('')
                setFilterSinGestiones(false)
              }}
              className="text-sm text-red-500 hover:text-red-700 underline"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ExclamationTriangleIcon className="w-10 h-10 mb-2" />
            <p>No se encontraron casos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Correo</th>
                  <th className="px-4 py-3 font-medium">País</th>
                  <th className="px-4 py-3 font-medium">Suscripción</th>
                  <th className="px-4 py-3 font-medium text-center">Intentos</th>
                  <th className="px-4 py-3 font-medium text-right">Último monto</th>
                  <th className="px-4 py-3 font-medium">Última fecha</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => {
                  const ec = ESTADO_COLORS[g.estado] || ESTADO_COLORS.pendiente
                  return (
                    <tr key={g.correo} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{g.nombre || '\u2014'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{g.correo}</td>
                      <td className="px-4 py-3 text-gray-600">{g.pais || '\u2014'}</td>
                      <td className="px-4 py-3 text-gray-600">{g.suscripcion || '\u2014'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          {g.intentos} intento{g.intentos !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                        {fmtUSD(g.lastMonto)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{g.lastFecha ? fmtDate(g.lastFecha) : '\u2014'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ec.bg} ${ec.text}`}>
                          {ESTADO_LABELS[g.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {g.telefono && (
                            <a
                              href={`https://wa.me/${g.telefono.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                              title="Abrir WhatsApp"
                            >
                              <ChatBubbleLeftRightIcon className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => openDrawer(g)}
                            className="px-3 py-1 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
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
        )}
      </div>

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
                    <p className="font-medium text-gray-900">{drawerUser.nombre || '\u2014'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Correo</span>
                    <p className="font-medium text-gray-900 break-all">{drawerUser.correo}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Teléfono</span>
                    <p className="font-medium text-gray-900">{drawerUser.telefono || '\u2014'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">País</span>
                    <p className="font-medium text-gray-900">{drawerUser.pais || '\u2014'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Suscripción</span>
                    <p className="font-medium text-gray-900">{drawerUser.suscripcion || '\u2014'}</p>
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
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg text-sm">
                      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">
                        {drawerUser.failures.length - i}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-600">{fmtDate(f.fecha_pago_fallido)}</p>
                        <p className="text-xs text-gray-400">{f.suscripcion}</p>
                      </div>
                      <span className="font-semibold text-red-700 whitespace-nowrap">{fmtUSD(f.monto_pago)}</span>
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
                      const CanalIcon = CANAL_ICONS[ge.canal] || ChatBubbleLeftRightIcon
                      const ec = ESTADO_COLORS[ge.estado] || ESTADO_COLORS.pendiente
                      return (
                        <div key={ge.id} className={`p-3 rounded-lg border text-sm ${ge.es_cierre ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <CanalIcon className="w-4 h-4 text-gray-500" />
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
                                Plan: {ge.plan_comprado} | Recuperado: {fmtUSD(ge.monto_recuperado || 0)}
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

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string
  value: string
  icon: React.ElementType
  color: string
  loading?: boolean
}) {
  const parts = color.split(' ')
  const bgColor = parts[0] || ''
  const textColor = parts[1] || ''
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
          {loading ? '...' : value}
        </h3>
      </div>
      <div className={`p-2.5 rounded-lg ${bgColor}`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
    </div>
  )
}
