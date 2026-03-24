// POST /api/communication/bulk-submit-templates
// Submits multiple templates to Meta for approval via Kapso, sequentially with delay.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { submitTemplateToMeta } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const { templateIds } = await req.json();

  if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
    return NextResponse.json({ error: 'templateIds array required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const results: { id: number; success: boolean; error?: string; kapso_id?: string }[] = [];

  for (const id of templateIds) {
    // Fetch template
    const { data: template, error: fetchError } = await supabase
      .from('comm_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !template) {
      results.push({ id, success: false, error: 'Template no encontrado' });
      continue;
    }

    try {
      const result = await submitTemplateToMeta({
        nombre: template.nombre,
        body: template.body,
        variables: template.variables ?? [],
        categoria: template.categoria ?? 'utility',
        buttons: template.buttons ?? [],
      });

      await supabase
        .from('comm_templates')
        .update({
          estado: 'revision',
          kapso_template_id: result.id,
          submission_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      results.push({ id, success: true, kapso_id: result.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bulk-submit] error template ${id}:`, message);

      let userError = message;
      try {
        const match = message.match(/\{.*\}/s);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const metaErr = parsed?.error;
          if (metaErr?.error_user_title) {
            userError = `${metaErr.error_user_title}: ${metaErr.error_user_msg}`;
          }
        }
      } catch { /* keep original */ }

      await supabase
        .from('comm_templates')
        .update({
          estado: 'borrador',
          submission_error: userError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      results.push({ id, success: false, error: userError });
    }

    // Rate limit delay between submissions (2s to avoid Kapso/Cloudflare 520)
    if (templateIds.indexOf(id) < templateIds.length - 1) {
      await delay(2000);
    }
  }

  return NextResponse.json({ results });
}
