// POST /api/communication/broadcast-detail
// Fetches broadcast stats + paginated recipients from Kapso.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBroadcastStatus, getBroadcastRecipients } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { broadcastId, page = 1, perPage = 20 } = await req.json();

  if (!broadcastId) {
    return NextResponse.json({ error: 'broadcastId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: broadcast, error } = await supabase
    .from('comm_broadcasts')
    .select('*, comm_templates(nombre, body, categoria)')
    .eq('id', broadcastId)
    .single();

  if (error || !broadcast?.kapso_broadcast_id) {
    return NextResponse.json({ error: 'Broadcast not found or missing Kapso ID' }, { status: 404 });
  }

  try {
    const [stats, recipientsData] = await Promise.all([
      getBroadcastStatus(broadcast.kapso_broadcast_id),
      getBroadcastRecipients(broadcast.kapso_broadcast_id, page, perPage),
    ]);

    // Update local DB with latest stats
    await supabase
      .from('comm_broadcasts')
      .update({
        estado: stats.status === 'completed' ? 'completado' : stats.status === 'failed' ? 'error' : stats.status === 'sending' ? 'enviando' : broadcast.estado,
        total_destinatarios: stats.total_recipients,
        enviados: stats.sent_count,
        entregados: stats.delivered_count,
        leidos: stats.read_count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId);

    return NextResponse.json({
      ok: true,
      broadcast: {
        ...broadcast,
        total_destinatarios: stats.total_recipients,
        enviados: stats.sent_count,
        entregados: stats.delivered_count,
        leidos: stats.read_count,
        respondidos: stats.responded_count,
        fallidos: stats.failed_count,
        tasa_respuesta: stats.response_rate,
        kapso_status: stats.status,
      },
      recipients: recipientsData.recipients,
      meta: recipientsData.meta,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
