// POST /api/communication/submit-template
// Submits a template to Meta for approval via Kapso, then updates Supabase.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { submitTemplateToMeta } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { templateId } = await req.json();

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch template from DB
  const { data: template, error: fetchError } = await supabase
    .from('comm_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (fetchError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  try {
    const result = await submitTemplateToMeta({
      nombre: template.nombre,
      body: template.body,
      variables: template.variables ?? [],
      categoria: template.categoria ?? 'utility',
    });

    // Update Supabase: estado → revision, save kapso_template_id
    await supabase
      .from('comm_templates')
      .update({
        estado: 'revision',
        kapso_template_id: result.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);

    return NextResponse.json({ ok: true, kapso_id: result.id, meta_status: result.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[submit-template] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
