'use client'

import { useCallback, useEffect, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, rectIntersection, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { ProductInitiative } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import InitiativeCard from './InitiativeCard'

const COLUMNS = [
  { id: 'design', label: 'En diseño' },
  { id: 'running', label: 'En progreso' },
  { id: 'completed', label: 'Terminado' },
  { id: 'paused', label: 'En pausa' },
]

type ProgressMap = Record<number, { completed: number; total: number }>

interface DeliveryKanbanProps {
  initiatives: ProductInitiative[]
  onSelect: (initiative: ProductInitiative) => void
  onUpdate: (id: number, updates: Partial<ProductInitiative>) => Promise<void>
  onRefresh: () => Promise<void>
  onFinalize?: (initiative: ProductInitiative) => void
}

export default function DeliveryKanban({ initiatives, onSelect, onUpdate, onRefresh, onFinalize }: DeliveryKanbanProps) {
  const { supabase } = useAuth()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [progressMap, setProgressMap] = useState<ProgressMap>({})
  const [activeInitiative, setActiveInitiative] = useState<ProductInitiative | null>(null)

  // Fetch task progress for all linked projects in one batch
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
                        mode="delivery"
                        progress={progressMap[item.id]}
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
            mode="delivery"
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
