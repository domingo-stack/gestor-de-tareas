// POST /api/communication/sync-broadcast
// Fetches broadcast metrics from Kapso and updates local DB.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBroadcastStatus } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { broadcastId } = await req.json();

  if (!broadcastId) {
    return NextResponse.json({ error: 'broadcastId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch local broadcast
  const { data: broadcast, error } = await supabase
    .from('comm_broadcasts')
    .select('kapso_broadcast_id')
    .eq('id', broadcastId)
    .single();

  if (error || !broadcast?.kapso_broadcast_id) {
    return NextResponse.json({ error: 'Broadcast not found or missing Kapso ID' }, { status: 404 });
  }

  try {
    const kapso = await getBroadcastStatus(broadcast.kapso_broadcast_id);

    // Map Kapso status to our estados
    const estadoMap: Record<string, string> = {
      draft: 'borrador',
      sending: 'enviando',
      sent: 'completado',
      completed: 'completado',
      failed: 'error',
    };

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (kapso.status) update.estado = estadoMap[kapso.status] ?? kapso.status;
    if (kapso.total_recipients != null) update.total_destinatarios = kapso.total_recipients;
    if (kapso.sent != null) update.enviados = kapso.sent;
    if (kapso.delivered != null) update.entregados = kapso.delivered;
    if (kapso.read != null) update.leidos = kapso.read;

    await supabase
      .from('comm_broadcasts')
      .update(update)
      .eq('id', broadcastId);

    return NextResponse.json({ ok: true, kapso, update });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
