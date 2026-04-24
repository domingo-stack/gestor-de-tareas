'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'
import BacklogTable from '@/components/producto/BacklogTable'
import RoadmapKanban from '@/components/producto/RoadmapKanban'
import ExperimentosTable from '@/components/producto/ExperimentosTable'
import SidePeek from '@/components/producto/SidePeek'
import FinalizeModal from '@/components/producto/FinalizeModal'
import { ProductInitiative } from '@/lib/types'
import { Toaster } from 'sonner'
import { CheckCircleIcon, ArchiveBoxIcon, BeakerIcon } from '@heroicons/react/24/outline'

type TabKey = 'backlog' | 'delivery' | 'discovery'

const TABS: { key: TabKey; label: string; icon: typeof CheckCircleIcon }[] = [
  { key: 'backlog', label: 'Tareas Backlog', icon: CheckCircleIcon },
  { key: 'delivery', label: 'Finalizadas', icon: ArchiveBoxIcon },
  { key: 'discovery', label: 'Experimentos', icon: BeakerIcon },
]

type Member = { user_id: string; email: string; first_name?: string }

export default function ProductoPage() {
  const { supabase, user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('backlog')
  const [initiatives, setInitiatives] = useState<ProductInitiative[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInitiative, setSelectedInitiative] = useState<ProductInitiative | null>(null)
  const [finalizingInitiative, setFinalizingInitiative] = useState<ProductInitiative | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('get_all_members').then(({ data }) => {
      if (data) setMembers(data)
    })
  }, [supabase])

  const fetchInitiatives = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('product_initiatives')
      .select('*, projects(name)')
      .order('manual_order', { ascending: true })

    if (error) {
      console.error('Error fetching initiatives:', error)
    } else if (data) {
      const mapped = data.map((d: any) => ({
        ...d,
        project_name: d.projects?.name || null,
      }))
      setInitiatives(mapped as ProductInitiative[])
      setSelectedInitiative(prev => {
        if (!prev) return null
        const fresh = mapped.find((i: any) => i.id === prev.id)
        return fresh ? (fresh as ProductInitiative) : null
      })
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchInitiatives()
  }, [fetchInitiatives])

  const backlogItems = initiatives.filter(i => i.phase === 'backlog')
  const discoveryItems = initiatives.filter(i => i.phase === 'discovery')
  const finalizedItems = initiatives.filter(i => i.phase === 'finalized' || (i.phase === 'delivery' && i.status === 'completed'))

  const handleSelect = (initiative: ProductInitiative) => {
    setSelectedInitiative(initiative)
    setFinalizingInitiative(null)
  }

  const handleUpdate = useCallback(async (id: number, updates: Partial<ProductInitiative>) => {
    if (!supabase) return
    const { error } = await supabase
      .from('product_initiatives')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error('Error updating initiative:', error)
      return
    }

    setInitiatives(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    if (selectedInitiative?.id === id) {
      setSelectedInitiative(prev => prev ? { ...prev, ...updates } : null)
    }
  }, [supabase, selectedInitiative?.id])

  const handleDelete = useCallback(async (id: number) => {
    if (!supabase) return
    const { error } = await supabase
      .from('product_initiatives')
      .delete()
      .eq('id', id)

    if (!error) {
      setInitiatives(prev => prev.filter(i => i.id !== id))
      setSelectedInitiative(null)
    }
  }, [supabase])

  const handleCreate = useCallback(async (title: string, problemStatement: string) => {
    if (!supabase || !user) return
    const maxOrder = Math.max(0, ...backlogItems.map(i => (i as any).manual_order || 0))
    const { data, error } = await supabase
      .from('product_initiatives')
      .insert({
        title,
        problem_statement: problemStatement || null,
        phase: 'backlog',
        status: 'pending',
        item_type: 'feature',
        owner_id: user.id,
        manual_order: maxOrder + 1,
      })
      .select()
      .single()

    if (!error && data) {
      setInitiatives(prev => [data as ProductInitiative, ...prev])
    }
  }, [supabase, user, backlogItems])

  const handleComplete = useCallback(async (id: number) => {
    await handleUpdate(id, { phase: 'finalized', status: 'completed', completed_at: new Date().toISOString() } as any)
  }, [handleUpdate])

  const handleReopen = useCallback(async (id: number) => {
    await handleUpdate(id, { phase: 'backlog', status: 'pending', completed_at: null } as any)
    setActiveTab('backlog')
  }, [handleUpdate])

  const handleCreateInPhase = useCallback(async (title: string, phase: 'discovery' | 'delivery') => {
    if (!supabase || !user) return
    const { data, error } = await supabase
      .from('product_initiatives')
      .insert({
        title,
        phase,
        status: 'design',
        item_type: phase === 'discovery' ? 'experiment' : 'feature',
        owner_id: user.id,
      })
      .select()
      .single()

    if (!error && data) {
      setInitiatives(prev => [data as ProductInitiative, ...prev])
    }
  }, [supabase, user])

  return (
    <AuthGuard>
      <ModuleGuard module="mod_producto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          <Toaster position="top-right" richColors />

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Producto</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className="text-xs text-gray-400">
                  {tab.key === 'backlog' ? backlogItems.length
                    : tab.key === 'discovery' ? discoveryItems.length
                    : finalizedItems.length}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center items-center min-h-[40vh]">
              <p className="text-gray-500">Cargando...</p>
            </div>
          ) : (
            <>
              {activeTab === 'backlog' && (
                <BacklogTable
                  initiatives={backlogItems}
                  onSelect={handleSelect}
                  onUpdate={handleUpdate}
                  onCreate={handleCreate}
                  onComplete={handleComplete}
                />
              )}
              {activeTab === 'delivery' && (
                <RoadmapKanban
                  initiatives={finalizedItems}
                  onSelect={handleSelect}
                  onReopen={handleReopen}
                />
              )}
              {activeTab === 'discovery' && (
                <ExperimentosTable
                  initiatives={discoveryItems}
                  onSelect={handleSelect}
                  onUpdate={handleUpdate}
                  onCreate={(title) => handleCreateInPhase(title, 'discovery')}
                  members={members}
                />
              )}
            </>
          )}

          {selectedInitiative && !finalizingInitiative && (
            <SidePeek
              initiative={selectedInitiative}
              onClose={() => setSelectedInitiative(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={fetchInitiatives}
              autoPromote={false}
              autoFinalize={false}
              onFinalize={(init) => { setFinalizingInitiative(init); setSelectedInitiative(null) }}
              members={members}
            />
          )}

          {finalizingInitiative && (
            <FinalizeModal
              initiative={finalizingInitiative}
              onClose={() => { setFinalizingInitiative(null); setSelectedInitiative(null) }}
              onUpdate={handleUpdate}
              onRefresh={fetchInitiatives}
            />
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
