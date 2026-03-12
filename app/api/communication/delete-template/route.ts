// POST /api/communication/delete-template
// Deletes a template from Meta/Kapso and then from the local database.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deleteTemplateFromMeta } from '@/lib/kapso';

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

  const { data: template, error } = await supabase
    .from('comm_templates')
    .select('id, nombre, kapso_template_id')
    .eq('id', templateId)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // If template was submitted to Meta, delete it there first
  let metaDeleted = false;
  if (template.kapso_template_id) {
    // Meta uses the template name (snake_case) for deletion, not the ID
    const metaName = template.nombre
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    try {
      await deleteTemplateFromMeta(metaName);
      metaDeleted = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[delete-template] Meta deletion failed (continuing with local delete):', message);
      // Don't block local deletion if Meta fails — template might already be gone
    }
  }

  // Delete from local database
  const { error: deleteError } = await supabase
    .from('comm_templates')
    .delete()
    .eq('id', templateId);

  if (deleteError) {
    return NextResponse.json({ error: 'Error deleting from database' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, meta_deleted: metaDeleted });
}
