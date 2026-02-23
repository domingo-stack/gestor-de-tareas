'use client'

import { useCallback, useEffect, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, rectIntersection, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { ProductInitiative } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import InitiativeCard from './InitiativeCard'
import { toast } from 'sonner'

const COLUMNS = [
  { id: 'design', label: 'En diseño' },
  { id: 'running', label: 'Ejecutándose' },
  { id: 'completed', label: 'Terminado' },
  { id: 'paused', label: 'En pausa' },
]

interface DiscoveryKanbanProps {
  initiatives: ProductInitiative[]
  onSelect: (initiative: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onRefresh: () => Promise<void>
  onFinalize?: (initiative: ProductInitiative) => void
}

type ProgressMap = Record<number, { completed: number; total: number }>

export default function DiscoveryKanban({ initiatives, onSelect, onUpdate, onRefresh, onFinalize }: DiscoveryKanbanProps) {
  const { supabase } = useAuth()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [activeInitiative, setActiveInitiative] = useState<ProductInitiative | null>(null)
  const [progressMap, setProgressMap] = useState<ProgressMap>({})

  // Fetch task progress for discovery initiatives with linked projects
  useEffect(() => {
    if (!supabase) return
    const projectIds = initiatives.map(i => i.project_id).filter((id): id is number => id !== null)
    if (projectIds.length === 0) return

    const uniqueIds = [...new Set(projectIds)]

    supabase
      .from('tasks')
      .select('project_id, status')
      .in('project_id', uniqueIds)
      .is('archived_at', null)
      .then(({ data }) => {
        if (!data) return
        const map: ProgressMap = {}
        for (const task of data) {
          if (!task.project_id) continue
          if (!map[task.project_id]) map[task.project_id] = { completed: 0, total: 0 }
          map[task.project_id].total++
          if (task.status === 'Hecho') map[task.project_id].completed++
        }
        const initiativeProgress: ProgressMap = {}
        for (const init of initiatives) {
          if (init.project_id && map[init.project_id]) {
            initiativeProgress[init.id] = map[init.project_id]
          }
        }
        setProgressMap(initiativeProgress)
      })
  }, [supabase, initiatives])

  const handleDragStart = (event: DragStartEvent) => {
    const item = initiatives.find(i => i.id === Number(event.active.id))
    if (item) setActiveInitiative(item)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveInitiative(null)
    const { active, over } = event
    if (!over) return

    const initiativeId = Number(active.id)
    const newStatus = String(over.id)

    if (!COLUMNS.find(c => c.id === newStatus)) return

    const item = initiatives.find(i => i.id === initiativeId)
    if (!item || item.status === newStatus) return

    await onUpdate(initiativeId, { status: newStatus as ProductInitiative['status'] })
  }, [initiatives, onUpdate])

  const [escalatingIds, setEscalatingIds] = useState<Set<number>>(new Set())

  const handleCreateFeature = useCallback(async (parentInitiative: ProductInitiative) => {
    if (!supabase) return

    // Prevent duplicate escalation
    if (escalatingIds.has(parentInitiative.id)) return
    setEscalatingIds(prev => new Set(prev).add(parentInitiative.id))

    // Check if already escalated
    const { data: existing } = await supabase
      .from('product_initiatives')
      .select('id')
      .eq('parent_id', parentInitiative.id)
      .eq('phase', 'delivery')
      .limit(1)

    if (existing && existing.length > 0) {
      toast.info('Este experimento ya fue escalado a Delivery')
      setEscalatingIds(prev => { const s = new Set(prev); s.delete(parentInitiative.id); return s })
      return
    }

    const { error } = await supabase
      .from('product_initiatives')
      .insert({
        title: parentInitiative.title,
        problem_statement: parentInitiative.problem_statement,
        item_type: 'feature',
        phase: 'delivery',
        status: 'design',
        owner_id: parentInitiative.owner_id,
        parent_id: parentInitiative.id,
        project_id: parentInitiative.project_id,
        period_type: parentInitiative.period_type,
        period_value: parentInitiative.period_value,
        experiment_data: parentInitiative.experiment_data,
      })
      .select()
      .single()

    if (error) {
      toast.error('Error creando feature: ' + error.message)
    } else {
      toast.success('Feature creada en Delivery')
      await onRefresh()
    }
    setEscalatingIds(prev => { const s = new Set(prev); s.delete(parentInitiative.id); return s })
  }, [supabase, onRefresh, escalatingIds])

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const items = initiatives.filter(i => i.status === col.id)
          return (
            <KanbanColumn key={col.id} id={col.id} label={col.label} count={items.length}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-[100px] max-h-[65vh] overflow-y-auto p-1 pr-2">
                  {items.length > 0 ? (
                    items.map(item => (
                      <InitiativeCard
                        key={item.id}
                        initiative={item}
                        onClick={() => onSelect(item)}
                        mode="discovery"
                        progress={progressMap[item.id]}
                        onCreateFeature={
                          item.status === 'completed' && item.experiment_data?.result === 'won'
                            ? () => handleCreateFeature(item)
                            : undefined
                        }
                        onFinalize={
                          item.status === 'completed' && onFinalize
                            ? () => onFinalize(item)
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center h-full flex items-center justify-center min-h-[100px]">
                      <p className="text-sm text-gray-500">Arrastra una tarjeta aquí</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </KanbanColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeInitiative ? (
          <InitiativeCard
            initiative={activeInitiative}
            onClick={() => {}}
            mode="discovery"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="rounded-lg p-4 flex flex-col transition-colors"
      style={{ backgroundColor: isOver ? '#EBF0F7' : '#F9FAFB' }}
    >
      <h3 className="font-bold text-lg mb-4" style={{ color: '#383838' }}>
        {label} ({count})
      </h3>
      {children}
    </div>
  )
}
