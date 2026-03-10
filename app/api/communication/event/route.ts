// POST /api/communication/event
// Called by Bubble when an action event occurs (registro_taller, bienvenida, plan_cancelado).
// Finds active automation rules for the event type and sends WhatsApp messages via Kapso.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTemplateMessage } from '@/lib/kapso';

const PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID!;
const BUBBLE_WEBHOOK_SECRET = process.env.BUBBLE_WEBHOOK_SECRET!;

// Service-role Supabase client (server-side only)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (BUBBLE_WEBHOOK_SECRET !== 'pendiente' && token !== BUBBLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────
  let body: {
    evento_tipo: string;
    bubble_user_id: string;
    variables?: Record<string, string>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { evento_tipo, bubble_user_id, variables = {} } = body;

  if (!evento_tipo || !bubble_user_id) {
    return NextResponse.json({ error: 'evento_tipo and bubble_user_id are required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // ── Find active rules for this event type ─────────────────
  const { data: rules, error: rulesError } = await supabase
    .from('comm_event_rules')
    .select('*, comm_templates(nombre, body, variables, estado)')
    .eq('evento_tipo', evento_tipo)
    .eq('activo', true)
    .eq('timing_dias', 0); // Only immediate rules (timing_dias > 0 handled by n8n)

  if (rulesError) {
    console.error('[event] rules fetch error:', rulesError);
    return NextResponse.json({ error: 'DB error fetching rules' }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ message: 'No active immediate rules for this event', sent: 0 });
  }

  // ── Find contact ──────────────────────────────────────────
  const { data: contact, error: contactError } = await supabase
    .from('growth_users')
    .select('id, phone, email, first_name, last_name, whatsapp_valido')
    .eq('bubble_user_id', bubble_user_id)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: 'Contact not found', bubble_user_id }, { status: 404 });
  }

  if (!contact.whatsapp_valido || !contact.phone) {
    return NextResponse.json({ error: 'Contact has no valid WhatsApp number', sent: 0 });
  }

  // ── Send message for each rule ────────────────────────────
  const results: Array<{ rule_id: number; status: string; kapso_message_id?: string; error?: string }> = [];

  for (const rule of rules) {
    const template = rule.comm_templates;

    if (!template || template.estado !== 'aprobado') {
      results.push({ rule_id: rule.id, status: 'skipped', error: 'Template not approved' });
      continue;
    }

    // Merge contact data into variables
    const mergedVars: Record<string, string> = {
      nombre: contact.first_name ?? '',
      apellido: contact.last_name ?? '',
      ...variables,
    };

    try {
      const msgResult = await sendTemplateMessage({
        phoneNumberId: PHONE_NUMBER_ID,
        to: contact.phone,
        templateName: template.nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        variables: mergedVars,
      });

      const kapsoMessageId = msgResult.messages?.[0]?.id ?? null;

      // Log to message_logs
      await supabase.from('comm_message_logs').insert({
        contact_id: contact.id,
        template_id: rule.template_id,
        evento_tipo,
        kapso_message_id: kapsoMessageId,
        estado: 'sent',
        created_at: new Date().toISOString(),
      });

      results.push({ rule_id: rule.id, status: 'sent', kapso_message_id: kapsoMessageId });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[event] send error for rule ${rule.id}:`, errorMsg);

      // Log failure
      await supabase.from('comm_message_logs').insert({
        contact_id: contact.id,
        template_id: rule.template_id,
        evento_tipo,
        kapso_message_id: null,
        estado: 'failed',
        error: errorMsg,
        created_at: new Date().toISOString(),
      });

      results.push({ rule_id: rule.id, status: 'failed', error: errorMsg });
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  return NextResponse.json({ message: 'Processed', sent, total_rules: rules.length, results });
}
