// ============================================================================
// CRM Types — shared interfaces para el módulo /crm
// ============================================================================

export type CrmPipelineStage = {
  id: string;
  name: string;
  display_order: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  is_default_entry: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmLostReason = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
};

export type CrmLead = {
  id: string;
  external_id: string | null;
  external_source: string;
  // Datos del lead
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  country: string | null;
  // Contexto
  landing_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  form_payload: Record<string, unknown> | null;
  // Estado CRM
  stage_id: string;
  assigned_to: string | null;
  lost_reason_id: string | null;
  next_step: string | null;
  next_step_at: string | null;
  estimated_value_usd: number | null;
  won_value_usd: number | null;
  notes: Record<string, unknown> | null; // TipTap JSON
  // Tracking
  stage_updated_at: string;
  closed_at: string | null;
  // Auditoría
  created_at: string;
  imported_at: string;
  original_created_at: string | null;
  updated_at: string;
};

export type CrmLeadActivity = {
  id: string;
  lead_id: string;
  user_id: string;
  activity_type: 'note' | 'email_sent' | 'call_made' | 'meeting' | 'stage_changed' | 'assigned';
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type CrmSyncLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error' | 'partial';
  leads_fetched: number | null;
  leads_inserted: number | null;
  leads_skipped: number | null;
  error_message: string | null;
};

// User minimal para owner/assigned dropdowns
export type CrmUser = {
  user_id: string;
  email: string;
  role: string;
};
