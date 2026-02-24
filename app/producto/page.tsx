'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'
import BacklogTable from '@/components/producto/BacklogTable'
import RoadmapKanban from '@/components/producto/RoadmapKanban'
import ExperimentosTable from '@/components/producto/ExperimentosTable'
import SidePeek from '@/components/producto/SidePeek'
import { ProductInitiative } from '@/lib/types'
import { Toaster } from 'sonner'

type TabKey = 'backlog' | 'delivery' | 'discovery'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'delivery', label: 'Roadmap' },
  { key: 'discovery', label: 'Experimentos' },
]

type Member = { user_id: string; email: string; first_name?: string }

export default function ProductoPage() {
  const { supabase, user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('backlog')
  const [initiatives, setInitiatives] = useState<ProductInitiative[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInitiative, setSelectedInitiative] = useState<ProductInitiative | null>(null)
  const [promotingInitiative, setPromotingInitiative] = useState<ProductInitiative | null>(null)
  const [finalizingInitiative, setFinalizingInitiative] = useState<ProductInitiative | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  // Fetch members
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
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching initiatives:', error)
    } else if (data) {
      const mapped = data.map((d: any) => ({
        ...d,
        project_name: d.projects?.name || null,
      }))
      setInitiatives(mapped as ProductInitiative[])
      // Sync selectedInitiative with fresh data
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

  // Auto-move paused delivery items to 'design' (Roadmap has no paused column)
  useEffect(() => {
    if (!supabase || loading) return
    const pausedDelivery = initiatives.filter(i => i.phase === 'delivery' && i.status === 'paused')
    for (const item of pausedDelivery) {
      supabase
        .from('product_initiatives')
        .update({ status: 'design' })
        .eq('id', item.id)
        .then(() => {
          setInitiatives(prev => prev.map(i => i.id === item.id ? { ...i, status: 'design' } : i))
        })
    }
  }, [supabase, loading, initiatives])

  const backlogItems = initiatives.filter(i => i.phase === 'backlog')
  const discoveryItems = initiatives.filter(i => i.phase === 'discovery')
  const deliveryItems = initiatives.filter(i => i.phase === 'delivery')

  const handleSelect = (initiative: ProductInitiative) => {
    setSelectedInitiative(initiative)
    setPromotingInitiative(null)
    setFinalizingInitiative(null)
  }

  const handlePromoteFromTable = (initiative: ProductInitiative) => {
    setSelectedInitiative(initiative)
    setPromotingInitiative(initiative)
    setFinalizingInitiative(null)
  }

  const handleFinalizeFromCard = (initiative: ProductInitiative) => {
    setSelectedInitiative(initiative)
    setFinalizingInitiative(initiative)
    setPromotingInitiative(null)
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

    // Auto-navigate tab when phase changes
    if (updates.phase === 'discovery') setActiveTab('discovery')
    if (updates.phase === 'delivery') setActiveTab('delivery')
    if (updates.phase === 'backlog') setActiveTab('backlog')
  }, [supabase, selectedInitiative?.id])

  const handleDelete = useCallback(async (id: number) => {
    if (!supabase) return
    const { error } = await supabase
      .from('product_initiatives')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting initiative:', error)
      return
    }

    setInitiatives(prev => prev.filter(i => i.id !== id))
    setSelectedInitiative(null)
  }, [supabase])

  const handleCreate = useCallback(async (title: string, problemStatement: string) => {
    if (!supabase || !user) return
    const { data, error } = await supabase
      .from('product_initiatives')
      .insert({
        title,
        problem_statement: problemStatement || null,
        phase: 'backlog',
        status: 'pending',
        item_type: 'feature',
        owner_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating initiative:', error)
      return
    }

    if (data) {
      setInitiatives(prev => [data as ProductInitiative, ...prev])
    }
  }, [supabase, user])

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

    if (error) {
      console.error('Error creating initiative:', error)
      return
    }

    if (data) {
      setInitiatives(prev => [data as ProductInitiative, ...prev])
    }
  }, [supabase, user])

  return (
    <AuthGuard>
      <ModuleGuard module="mod_producto">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Toaster position="top-right" richColors />

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold" style={{ color: '#383838' }}>
              Producto
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs text-gray-400">
                  {tab.key === 'backlog' ? backlogItems.length
                    : tab.key === 'discovery' ? discoveryItems.length
                    : deliveryItems.length}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center items-center min-h-[40vh]">
              <p className="text-gray-500">Cargando iniciativas...</p>
            </div>
          ) : (
            <>
              {activeTab === 'backlog' && (
                <BacklogTable
                  initiatives={backlogItems}
                  onSelect={handleSelect}
                  onUpdate={handleUpdate}
                  onCreate={handleCreate}
                  onPromote={handlePromoteFromTable}
                />
              )}
              {activeTab === 'delivery' && (
                <RoadmapKanban
                  initiatives={deliveryItems}
                  onSelect={handleSelect}
                  onUpdate={handleUpdate}
                  onFinalize={handleFinalizeFromCard}
                  onCreate={(title) => handleCreateInPhase(title, 'delivery')}
                  members={members}
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

          {/* SidePeek */}
          {selectedInitiative && (
            <SidePeek
              initiative={selectedInitiative}
              onClose={() => { setSelectedInitiative(null); setPromotingInitiative(null); setFinalizingInitiative(null) }}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={fetchInitiatives}
              autoPromote={promotingInitiative?.id === selectedInitiative.id}
              autoFinalize={finalizingInitiative?.id === selectedInitiative.id}
              members={members}
            />
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
