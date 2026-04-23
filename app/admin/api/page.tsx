'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { usePermissions } from '@/context/PermissionsContext'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import {
  KeyIcon, DocumentTextIcon, PlusIcon, TrashIcon,
  ClipboardDocumentIcon, EyeIcon, EyeSlashIcon,
  ArrowLeftIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'sonner'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  permissions: string[]
  is_active: boolean
  last_used: string | null
  created_at: string
}

const PERMISSION_OPTIONS = [
  { value: 'calendar:read', label: 'Calendario (leer)' },
  { value: 'calendar:write', label: 'Calendario (crear)' },
  { value: 'content:read', label: 'Contenido Social (leer)' },
  { value: 'content:write', label: 'Contenido Social (crear)' },
]

const API_DOCS = [
  {
    title: 'Calendar Events',
    method: 'POST',
    path: '/api/calendar/events',
    description: 'Crea un evento en el calendario del Gestor.',
    auth: 'Bearer <API_KEY>',
    body: `{
  "title": "Nombre del evento",
  "start_date": "2026-05-01",
  "team": "Marketing | Producto | Customer Success | General | Kali Te Enseña",
  "description": "Descripción (opcional)",
  "end_date": "2026-05-01",
  "video_link": "https://...",
  "custom_data": { "estado": "Pendiente", "formato": "Video" },
  "notify": true
}`,
    responses: [
      { code: 201, desc: 'Evento creado', example: '{ "event": {...}, "notifications_sent": 5 }' },
      { code: 400, desc: 'Campo requerido faltante' },
      { code: 401, desc: 'Token inválido' },
      { code: 422, desc: 'Team no válido' },
    ],
  },
  {
    title: 'Calendar Events (List)',
    method: 'GET',
    path: '/api/calendar/events',
    description: 'Lista eventos filtrados por fecha y team.',
    auth: 'Bearer <API_KEY>',
    body: null,
    params: 'from=2026-05-01&to=2026-05-31&team=Marketing&limit=50',
    responses: [
      { code: 200, desc: 'Lista de eventos', example: '{ "events": [...], "total": 10 }' },
    ],
  },
  {
    title: 'Content Social — Blog List',
    method: 'GET',
    path: '/api/content-social/blogs',
    description: 'Lista blogs disponibles para generar contenido.',
    auth: 'Server-side proxy (CALIFICA_API_KEY)',
    body: null,
    responses: [
      { code: 200, desc: 'Lista de blogs', example: '{ "blogs": [...] }' },
    ],
  },
  {
    title: 'Content Social — Generate',
    method: 'POST',
    path: '/api/content-social/generate',
    description: 'Genera carruseles de contenido a partir de un blog via IA.',
    auth: 'Server-side proxy (CALIFICA_API_KEY)',
    body: `{
  "blog_id": "uuid-del-blog",
  "config": {
    "count": 2,
    "slides_per_carousel": 6,
    "tone": "educativo-cercano",
    "platform": "instagram",
    "model": "anthropic/claude-sonnet-4-6"
  }
}`,
    responses: [
      { code: 200, desc: 'Carruseles generados', example: '{ "blog": {...}, "carousels": [...], "metadata": {...} }' },
    ],
  },
]

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = 'gst_'
  for (let i = 0; i < 40; i++) key += chars.charAt(Math.floor(Math.random() * chars.length))
  return key
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function AdminApiPage() {
  const { supabase, user } = useAuth()
  const { role } = usePermissions()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'keys' | 'docs'>('keys')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set())
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false })
    if (data) setKeys(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  if (role !== 'superadmin') {
    return (
      <AuthGuard>
        <div className="p-8 text-center">
          <p className="text-red-600 font-medium">Acceso restringido — Solo superadmins</p>
        </div>
      </AuthGuard>
    )
  }

  const handleCreate = async () => {
    if (!newName.trim() || !supabase || !user) return
    const rawKey = generateApiKey()
    const hashed = await hashKey(rawKey)

    const { error } = await supabase.from('api_keys').insert({
      name: newName.trim(),
      key_hash: hashed,
      key_prefix: rawKey.slice(0, 12),
      permissions: Array.from(newPerms),
      created_by: user.id,
    })

    if (error) {
      toast.error('Error creando API key')
      return
    }

    setNewKeyRevealed(rawKey)
    setNewName('')
    setNewPerms(new Set())
    setShowCreate(false)
    fetchKeys()
    toast.success('API key creada')
  }

  const handleRevoke = async (id: string) => {
    if (!supabase) return
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    fetchKeys()
    toast.success('API key revocada')
  }

  const handleDelete = async (id: string) => {
    if (!supabase) return
    await supabase.from('api_keys').delete().eq('id', id)
    fetchKeys()
    toast.success('API key eliminada')
  }

  const generateFullMarkdown = (): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://gestor.califica.ai'
    let md = `# API Reference — Gestor Califica\n\n`
    md += `Base URL: \`${baseUrl}\`\n\n`
    md += `## Autenticación\n\nTodos los endpoints requieren:\n\`\`\`\nAuthorization: Bearer <API_KEY>\n\`\`\`\n\n`
    md += `---\n\n## Endpoints\n\n`

    for (const doc of API_DOCS) {
      md += `### \`${doc.method} ${doc.path}\`\n\n`
      md += `${doc.description}\n\n`
      md += `**Auth:** \`${doc.auth}\`\n\n`
      if (doc.params) md += `**Query params:** \`${doc.params}\`\n\n`
      if (doc.body) md += `**Request body:**\n\`\`\`json\n${doc.body}\n\`\`\`\n\n`
      md += `**Respuestas:**\n\n`
      for (const r of doc.responses) {
        md += `- \`${r.code}\` — ${r.desc}${r.example ? ` → \`${r.example}\`` : ''}\n`
      }
      md += `\n---\n\n`
    }

    md += `## Notas\n\n`
    md += `- UI en español\n`
    md += `- Timestamps en UTC, semanas Dom-Sáb hora Lima (UTC-5)\n`
    md += `- Teams válidos para calendar: Marketing, Producto, Customer Success, General, Kali Te Enseña\n`
    md += `- Modelos IA disponibles: anthropic/claude-sonnet-4-6, anthropic/claude-opus-4-6, openai/gpt-4o, google/gemini-2.5-pro\n`

    return md
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al clipboard')
  }

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/admin/users')} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API & Integraciones</h1>
            <p className="text-sm text-gray-500">Gestiona API keys y consulta la documentación de endpoints</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {[
            { id: 'keys' as const, label: 'API Keys', icon: KeyIcon },
            { id: 'docs' as const, label: 'Documentación', icon: DocumentTextIcon },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ API KEYS TAB ═══ */}
        {activeTab === 'keys' && (
          <div className="space-y-4">
            {/* Revealed key banner */}
            {newKeyRevealed && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-semibold text-green-800">API Key creada — cópiala ahora, no se mostrará de nuevo</p>
                </div>
                <div className="flex items-center gap-2 bg-green-100 rounded-lg px-3 py-2">
                  <code className="flex-1 text-sm font-mono text-green-900 break-all">{newKeyRevealed}</code>
                  <button onClick={() => copyToClipboard(newKeyRevealed)}
                    className="p-1.5 hover:bg-green-200 rounded">
                    <ClipboardDocumentIcon className="w-4 h-4 text-green-700" />
                  </button>
                </div>
                <button onClick={() => setNewKeyRevealed(null)} className="text-xs text-green-600 hover:underline">
                  Ya la copié, cerrar
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">{keys.length} key{keys.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100">
                <PlusIcon className="w-4 h-4" /> Nueva API Key
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Key</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Permisos</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Creada</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                  ) : keys.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin API keys. Crea una para empezar.</td></tr>
                  ) : keys.map(k => (
                    <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-800">{k.name}</td>
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{k.key_prefix}...</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {k.permissions?.length ? k.permissions.map(p => (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{p}</span>
                          )) : <span className="text-xs text-gray-300">sin permisos</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          k.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>{k.is_active ? 'Activa' : 'Revocada'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {new Date(k.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {k.is_active && (
                            <button onClick={() => handleRevoke(k.id)} title="Revocar"
                              className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg">
                              <EyeSlashIcon className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(k.id)} title="Eliminar"
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Create modal */}
            {showCreate && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-gray-900">Nueva API Key</h3>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Nombre</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="ej: califica-web-production" autoFocus
                      className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">Permisos</label>
                    <div className="space-y-2">
                      {PERMISSION_OPTIONS.map(p => (
                        <label key={p.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" checked={newPerms.has(p.value)}
                            onChange={e => {
                              const next = new Set(newPerms)
                              if (e.target.checked) next.add(p.value); else next.delete(p.value)
                              setNewPerms(next)
                            }} className="rounded" />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-sm text-gray-500 rounded-xl hover:bg-gray-50">Cancelar</button>
                    <button onClick={handleCreate} disabled={!newName.trim()}
                      className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40">
                      Crear key
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ DOCUMENTACIÓN TAB ═══ */}
        {activeTab === 'docs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Endpoints disponibles para integración con plataformas del ecosistema Califica.</p>
              <div className="flex gap-2">
                <button onClick={() => {
                  const md = generateFullMarkdown()
                  navigator.clipboard.writeText(md)
                  toast.success('Documentación copiada al clipboard — lista para pegar a un agente IA')
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  Copiar todo (Markdown)
                </button>
                <button onClick={() => {
                  const md = generateFullMarkdown()
                  const blob = new Blob([md], { type: 'text/markdown' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'api-gestor-califica.md'; a.click()
                  URL.revokeObjectURL(url)
                  toast.success('Archivo .md descargado')
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                  <DocumentTextIcon className="w-3.5 h-3.5" />
                  Descargar .md
                </button>
              </div>
            </div>

            {API_DOCS.map((doc, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      doc.method === 'POST' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>{doc.method}</span>
                    <code className="text-sm font-mono text-gray-800">{doc.path}</code>
                  </div>
                  <button onClick={() => copyToClipboard(doc.path)} className="p-1 hover:bg-gray-100 rounded">
                    <ClipboardDocumentIcon className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <p className="text-sm text-gray-600">{doc.description}</p>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">Auth:</span>
                    <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{doc.auth}</code>
                  </div>

                  {doc.params && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 block mb-1">Query params:</span>
                      <code className="text-xs bg-gray-50 text-gray-600 px-3 py-2 rounded-lg block font-mono">{doc.params}</code>
                    </div>
                  )}

                  {doc.body && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 block mb-1">Request body:</span>
                      <pre className="text-xs bg-gray-900 text-green-400 px-4 py-3 rounded-lg overflow-x-auto font-mono">{doc.body}</pre>
                    </div>
                  )}

                  <div>
                    <span className="text-xs font-medium text-gray-500 block mb-1">Respuestas:</span>
                    <div className="space-y-1">
                      {doc.responses.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`font-bold px-1.5 py-0.5 rounded ${
                            r.code < 300 ? 'bg-green-100 text-green-700' : r.code < 500 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>{r.code}</span>
                          <span className="text-gray-600">{r.desc}</span>
                          {r.example && (
                            <code className="text-gray-400 font-mono">{r.example}</code>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
