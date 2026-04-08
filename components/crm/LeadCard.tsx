'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CrmLead, CrmUser } from '@/lib/crm-types';
import {
  BuildingOffice2Icon,
  MapPinIcon,
  ClockIcon,
  ChatBubbleLeftEllipsisIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/outline';

export interface LeadActivityStat {
  count: number;
  lastAt: string; // ISO
}

interface LeadCardProps {
  lead: CrmLead;
  members: CrmUser[];
  activityStat?: LeadActivityStat;
  onClick?: () => void;
  isDragOverlay?: boolean;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function fmtUSD(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function ownerInitials(email?: string): string {
  if (!email) return '?';
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function relativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  if (days >= 1) return `${days}d`;
  if (hrs >= 1) return `${hrs}h`;
  return 'ahora';
}

function fmtNextStep(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  if (days > 1 && days <= 7) return `en ${days}d`;
  if (days < -1) return `hace ${-days}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function LeadCard({ lead, members, activityStat, onClick, isDragOverlay }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    disabled: isDragOverlay,
  });

  const owner = lead.assigned_to ? members.find(m => m.user_id === lead.assigned_to) : null;
  const daysInStage = daysSince(lead.stage_updated_at);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging && !isDragOverlay ? 0.4 : 1,
    cursor: isDragOverlay ? 'grabbing' : 'grab',
  };

  // Truncar nombre si es muy largo
  const displayName = lead.full_name || lead.email || 'Sin nombre';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Solo abrir si no es un drag (drag empieza con un threshold)
        if (!isDragging && onClick) onClick();
      }}
      className={`bg-white rounded-md border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow ${
        isDragOverlay ? 'shadow-xl rotate-1' : ''
      }`}
    >
      {/* Header: nombre + owner avatar (solo si está asignado) */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1">
          {displayName}
        </p>
        {owner ? (
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-[#3c527a]"
            title={owner.email}
          >
            {ownerInitials(owner.email)}
          </div>
        ) : (
          <span
            className="flex-shrink-0 text-[9px] font-medium text-gray-400 uppercase tracking-wide border border-dashed border-gray-300 rounded px-1.5 py-0.5"
            title="Sin asignar"
          >
            sin asignar
          </span>
        )}
      </div>

      {/* Empresa */}
      {lead.company && (
        <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
          <BuildingOffice2Icon className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* País + valor estimado en una línea */}
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1.5">
        {lead.country && (
          <div className="flex items-center gap-1">
            <MapPinIcon className="w-3 h-3" />
            <span>{lead.country}</span>
          </div>
        )}
        {lead.estimated_value_usd && lead.estimated_value_usd > 0 && (
          <span className="font-semibold text-gray-700">
            {fmtUSD(lead.estimated_value_usd)}
          </span>
        )}
      </div>

      {/* Próximo paso (accionable) */}
      {lead.next_step && (
        <div className="flex items-start gap-1 mt-1 mb-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px]">
          <ArrowRightCircleIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <span className="text-gray-700 line-clamp-1">{lead.next_step}</span>
            {lead.next_step_at && (
              <span className="text-amber-700 font-medium ml-1">
                · {fmtNextStep(lead.next_step_at)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer: días en stage + última actividad */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
        <div className="flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          <span>{daysInStage === 0 ? 'hoy' : `${daysInStage}d en stage`}</span>
        </div>
        {activityStat ? (
          <div
            className="flex items-center gap-1 text-blue-600"
            title={`${activityStat.count} actividad${activityStat.count !== 1 ? 'es' : ''} · última hace ${relativeShort(activityStat.lastAt)}`}
          >
            <ChatBubbleLeftEllipsisIcon className="w-3 h-3" />
            <span className="font-medium">
              {activityStat.count} · {relativeShort(activityStat.lastAt)}
            </span>
          </div>
        ) : (
          <span className="italic text-gray-300">sin actividad</span>
        )}
      </div>
    </div>
  );
}
