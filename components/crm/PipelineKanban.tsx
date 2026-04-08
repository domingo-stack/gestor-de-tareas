'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  rectIntersection,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useAuth } from '@/context/AuthContext';
import { CrmLead, CrmPipelineStage, CrmLostReason, CrmUser } from '@/lib/crm-types';
import LeadCard, { LeadActivityStat } from './LeadCard';
import LostReasonModal from './LostReasonModal';
import LeadSidePeek from './LeadSidePeek';
import NewLeadModal from './NewLeadModal';
import { ArrowPathIcon, PlusIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

export default function PipelineKanban() {
  const { supabase } = useAuth();

  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [lostReasons, setLostReasons] = useState<CrmLostReason[]>([]);
  const [members, setMembers] = useState<CrmUser[]>([]);
  const [activityStats, setActivityStats] = useState<Record<string, LeadActivityStat>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<CrmLead | null>(null);
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);

  // Lost reason modal state
  const [pendingLostMove, setPendingLostMove] = useState<{
    lead: CrmLead;
    targetStageId: string;
  } | null>(null);

  const defaultStageId = stages.find(s => s.is_default_entry)?.id ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    const [stagesRes, leadsRes, reasonsRes, membersRes, activitiesRes] = await Promise.all([
      supabase.from('crm_pipeline_stages').select('*').eq('is_active', true).order('display_order'),
      supabase.from('crm_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_lost_reasons').select('*').eq('is_active', true).order('display_order'),
      supabase.rpc('get_all_members'),
      supabase.from('crm_lead_activities').select('lead_id, created_at'),
    ]);
    setStages(stagesRes.data ?? []);
    setLeads(leadsRes.data ?? []);
    setLostReasons(reasonsRes.data ?? []);
    setMembers(membersRes.data ?? []);

    // Aggregate activity stats por lead
    const stats: Record<string, LeadActivityStat> = {};
    for (const a of (activitiesRes.data ?? []) as { lead_id: string; created_at: string }[]) {
      const cur = stats[a.lead_id];
      if (!cur) {
        stats[a.lead_id] = { count: 1, lastAt: a.created_at };
      } else {
        cur.count += 1;
        if (a.created_at > cur.lastAt) cur.lastAt = a.created_at;
      }
    }
    setActivityStats(stats);
    setInitialLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find(l => l.id === String(event.active.id));
    if (lead) setActiveLead(lead);
  };

  const moveStage = useCallback(
    async (leadId: string, newStageId: string, lostReasonId: string | null = null) => {
      if (!supabase) return;
      const { error } = await supabase.rpc('crm_move_lead_stage', {
        p_lead_id: leadId,
        p_new_stage_id: newStageId,
        p_lost_reason_id: lostReasonId,
      });
      if (error) {
        toast.error(`Error moviendo lead: ${error.message}`);
        // Refetch para revertir el estado optimista
        fetchData();
        return;
      }
      toast.success('Lead actualizado');
      fetchData();
    },
    [supabase, fetchData],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveLead(null);
      const { active, over } = event;
      if (!over) return;

      const leadId = String(active.id);
      const newStageId = String(over.id);

      // Validar que es un stage real
      const targetStage = stages.find(s => s.id === newStageId);
      if (!targetStage) return;

      const lead = leads.find(l => l.id === leadId);
      if (!lead || lead.stage_id === newStageId) return;

      // Si el target es is_lost, abrir modal de razón antes de mover
      if (targetStage.is_lost) {
        setPendingLostMove({ lead, targetStageId: newStageId });
        return;
      }

      // Movimiento normal: optimistic update + RPC
      setLeads(prev =>
        prev.map(l => (l.id === leadId ? { ...l, stage_id: newStageId } : l)),
      );
      await moveStage(leadId, newStageId, null);
    },
    [stages, leads, moveStage],
  );

  const handleLostConfirm = useCallback(
    async (lostReasonId: string) => {
      if (!pendingLostMove) return;
      const { lead, targetStageId } = pendingLostMove;
      // Optimistic update
      setLeads(prev =>
        prev.map(l => (l.id === lead.id ? { ...l, stage_id: targetStageId, lost_reason_id: lostReasonId } : l)),
      );
      setPendingLostMove(null);
      await moveStage(lead.id, targetStageId, lostReasonId);
    },
    [pendingLostMove, moveStage],
  );

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <h3 className="text-lg font-semibold text-amber-800 mb-2">No hay stages configurados</h3>
        <p className="text-sm text-amber-600">
          Ve al tab Config para crear los stages del pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con resumen */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {leads.length} lead{leads.length !== 1 ? 's' : ''} en el pipeline
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewLeadModal(true)}
            disabled={!defaultStageId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300"
            title="Crear lead manual"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo lead
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Refrescar"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refrescar
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map(stage => {
            const stageLeads = leads.filter(l => l.stage_id === stage.id);
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                count={stageLeads.length}
              >
                <div className="space-y-2 min-h-[200px] max-h-[65vh] overflow-y-auto">
                  {stageLeads.length > 0 ? (
                    stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        members={members}
                        activityStat={activityStats[lead.id]}
                        onClick={() => setSelectedLead(lead)}
                      />
                    ))
                  ) : (
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-gray-400">Vacío</p>
                    </div>
                  )}
                </div>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} members={members} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* Lost reason modal */}
      <LostReasonModal
        open={!!pendingLostMove}
        reasons={lostReasons}
        leadName={pendingLostMove?.lead.full_name || pendingLostMove?.lead.email || 'este lead'}
        onConfirm={handleLostConfirm}
        onCancel={() => setPendingLostMove(null)}
      />

      {/* SidePeek de detalle */}
      {selectedLead && (
        <LeadSidePeek
          lead={selectedLead}
          stages={stages}
          lostReasons={lostReasons}
          members={members}
          onClose={() => setSelectedLead(null)}
          onUpdate={fetchData}
        />
      )}

      {/* Modal de nuevo lead manual */}
      <NewLeadModal
        open={showNewLeadModal}
        defaultStageId={defaultStageId}
        onClose={() => setShowNewLeadModal(false)}
        onCreated={fetchData}
      />
    </div>
  );
}

function KanbanColumn({
  stage,
  count,
  children,
}: {
  stage: CrmPipelineStage;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-72 rounded-lg flex flex-col transition-colors p-3"
      style={{ backgroundColor: isOver ? '#EBF0F7' : '#F9FAFB' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 truncate">
            {stage.name}
          </h3>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full flex-shrink-0">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
