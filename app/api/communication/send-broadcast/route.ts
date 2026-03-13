// POST /api/communication/send-broadcast
// Fetches filtered contacts, creates Kapso broadcast, adds recipients in batches, sends.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createBroadcast, addBroadcastRecipients, sendBroadcast } from '@/lib/kapso';

const BATCH_SIZE = 1000; // Kapso max per request

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface Filters {
  pais: string;
  plan_tipo: string;
  plan_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  cancelado_dias: string;
  eventos_min: string;
  nivel: string;
  grado: string;
  colegio: string;
}

export async function POST(req: NextRequest) {
  const { broadcastId } = await req.json();

  if (!broadcastId) {
    return NextResponse.json({ error: 'broadcastId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch broadcast record
  const { data: broadcast, error: bError } = await supabase
    .from('comm_broadcasts')
    .select('*, comm_templates(nombre, body, variables, estado, kapso_template_id, categoria)')
    .eq('id', broadcastId)
    .single();

  if (bError || !broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  }

  const template = broadcast.comm_templates;
  if (!template || template.estado !== 'aprobado') {
    return NextResponse.json({ error: 'Template not approved' }, { status: 400 });
  }
  if (!template.kapso_template_id) {
    return NextResponse.json({ error: 'Template missing Meta ID (kapso_template_id)' }, { status: 400 });
  }

  // Mark broadcast as sending
  await supabase
    .from('comm_broadcasts')
    .update({ estado: 'enviando', updated_at: new Date().toISOString() })
    .eq('id', broadcastId);

  // ── Fetch matching contacts ───────────────────────────────
  const filters: Filters = broadcast.segmento_filtros ?? {};

  let query = supabase
    .from('growth_users')
    .select('id, phone, first_name, last_name')
    .eq('whatsapp_valido', true)
    .not('phone', 'is', null);

  if (filters.pais && filters.pais !== 'Todos')       query = query.eq('country', filters.pais);
  if (filters.plan_tipo === 'paid')                    query = query.eq('plan_paid', true).eq('cancelled', false);
  if (filters.plan_tipo === 'free')                    query = query.eq('plan_free', true);
  if (filters.plan_tipo === 'cancelled') {
    query = query.eq('cancelled', true);
    if (filters.cancelado_dias) {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(filters.cancelado_dias));
      query = query.gte('subscription_end', since.toISOString());
    }
  }
  if (filters.plan_id && filters.plan_id !== 'todos') query = query.eq('plan_id', filters.plan_id);
  if (filters.plan_tipo === 'paid') {
    if (filters.fecha_desde)                           query = query.gte('subscription_end', filters.fecha_desde);
    if (filters.fecha_hasta)                           query = query.lte('subscription_end', `${filters.fecha_hasta}T23:59:59`);
  }
  if (filters.eventos_min)                             query = query.gte('eventos_valor', parseInt(filters.eventos_min));
  if (filters.nivel)                                   query = query.eq('nivel', filters.nivel);
  if (filters.grado)                                   query = query.ilike('grado', `%${filters.grado}%`);
  if (filters.colegio)                                 query = query.ilike('colegio', `%${filters.colegio}%`);

  const { data: contacts, error: cError } = await query;

  if (cError || !contacts || contacts.length === 0) {
    await supabase
      .from('comm_broadcasts')
      .update({ estado: 'error', updated_at: new Date().toISOString() })
      .eq('id', broadcastId);
    return NextResponse.json({ error: 'No contacts found for segment' }, { status: 400 });
  }

  try {
    // ── Create Kapso broadcast ────────────────────────────────
    const kapsoBroadcast = await createBroadcast(broadcast.nombre, template.kapso_template_id);

    // Fetch static comm_variables for template variable substitution
    const { data: commVars } = await supabase.from('comm_variables').select('key, value');
    const staticVars = Object.fromEntries(
      (commVars ?? []).map((v: { key: string; value: string }) => [v.key, v.value])
    );

    // Only pass variables the template declares (Meta rejects extra params)
    const templateVarKeys: string[] = template.variables ?? [];

    // ── Add recipients in batches of 1000 ────────────────────
    let totalAdded = 0;

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      const recipients = batch.map(c => {
        const allAvailable: Record<string, string> = {
          ...staticVars,
          nombre: c.first_name ?? '',
          name: c.first_name ?? '',
          apellido: c.last_name ?? '',
        };
        const variables = Object.fromEntries(
          templateVarKeys.map(key => [key, allAvailable[key] || '-'])
        );
        return { phone_number: c.phone!, variables };
      });

      const addResult = await addBroadcastRecipients(kapsoBroadcast.id, recipients);
      totalAdded += addResult.added;

      // Insert into message_logs for tracking
      const logRows = batch.map(c => ({
        contact_id: c.id,
        template_id: broadcast.template_id,
        broadcast_id: broadcastId,
        kapso_message_id: null,
        estado: 'queued',
        created_at: new Date().toISOString(),
      }));
      await supabase.from('comm_message_logs').insert(logRows);
    }

    // ── Send the broadcast ────────────────────────────────────
    await sendBroadcast(kapsoBroadcast.id);

    // Update broadcast record
    await supabase
      .from('comm_broadcasts')
      .update({
        estado: 'completado',
        kapso_broadcast_id: kapsoBroadcast.id,
        total_destinatarios: totalAdded,
        enviados: totalAdded,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId);

    return NextResponse.json({
      ok: true,
      kapso_broadcast_id: kapsoBroadcast.id,
      recipients_added: totalAdded,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-broadcast] error:', message);

    await supabase
      .from('comm_broadcasts')
      .update({ estado: 'error', updated_at: new Date().toISOString() })
      .eq('id', broadcastId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
