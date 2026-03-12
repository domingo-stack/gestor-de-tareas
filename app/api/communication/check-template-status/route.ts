// POST /api/communication/check-template-status
// Queries Kapso/Meta for the current approval status of a template and syncs it to the DB.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTemplateStatus } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const STATUS_MAP: Record<string, string> = {
  APPROVED: 'aprobado',
  REJECTED: 'rechazado',
  PENDING:  'revision',
  PAUSED:   'rechazado',
  DISABLED: 'rechazado',
};

export async function POST(req: NextRequest) {
  const { templateId } = await req.json();

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: template, error } = await supabase
    .from('comm_templates')
    .select('id, kapso_template_id, estado')
    .eq('id', templateId)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (!template.kapso_template_id) {
    return NextResponse.json({ error: 'Template has not been submitted to Meta yet' }, { status: 400 });
  }

  let metaData;
  try {
    metaData = await getTemplateStatus(template.kapso_template_id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[check-template-status] Kapso error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log('[check-template-status] Meta response:', metaData);
  const newEstado = STATUS_MAP[metaData.status] ?? 'revision';

  // Map Meta category to our format (Meta returns UTILITY/MARKETING/AUTHENTICATION)
  const metaCategory = metaData.category?.toLowerCase() as 'utility' | 'marketing' | undefined;

  // Update status and category from Meta (source of truth)
  const updatePayload: Record<string, unknown> = {
    estado: newEstado,
    motivo_rechazo: metaData.rejected_reason ?? null,
    submission_error: null,
    updated_at: new Date().toISOString(),
  };
  if (metaCategory) {
    updatePayload.categoria = metaCategory;
  }

  await supabase
    .from('comm_templates')
    .update(updatePayload)
    .eq('id', templateId);

  return NextResponse.json({
    meta_status: metaData.status,
    meta_category: metaCategory ?? null,
    estado: newEstado,
    changed: true,
    motivo_rechazo: metaData.rejected_reason ?? null,
  });
}
