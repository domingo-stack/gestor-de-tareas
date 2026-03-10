// POST /api/communication/status-update
// Called by Kapso webhooks when message status changes (sent, delivered, read, failed).
// Updates comm_message_logs and comm_broadcasts aggregate counters.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET!;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Verify Kapso HMAC signature
function verifySignature(rawBody: string, signature: string): boolean {
  if (KAPSO_WEBHOOK_SECRET === 'pendiente') return true; // Not configured yet
  const expected = createHmac('sha256', KAPSO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return signature === expected;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature') ?? '';
  const eventType = req.headers.get('x-webhook-event') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    event: string;
    data: {
      message: {
        id: string;
        kapso?: {
          status: string;
          statuses?: Array<{
            id: string;
            status: string;
            timestamp: string;
            recipient_id: string;
            errors?: Array<{ code: number; title: string; message: string }>;
          }>;
        };
      };
      conversation?: { phone_number: string };
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload.event ?? eventType;
  const message = payload.data?.message;
  const kapsoMessageId = message?.id;

  if (!kapsoMessageId) {
    return NextResponse.json({ error: 'No message id in payload' }, { status: 400 });
  }

  // Map Kapso event to our status
  const statusMap: Record<string, string> = {
    'whatsapp.message.sent':      'sent',
    'whatsapp.message.delivered': 'delivered',
    'whatsapp.message.read':      'read',
    'whatsapp.message.failed':    'failed',
  };

  const newStatus = statusMap[event];
  if (!newStatus) {
    // Event we don't care about — acknowledge and ignore
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  // Build update payload for message_logs
  const logUpdate: Record<string, unknown> = { estado: newStatus };
  if (newStatus === 'delivered') logUpdate.entregado_at = now;
  if (newStatus === 'read')      logUpdate.leido_at = now;
  if (newStatus === 'failed') {
    const lastStatus = message.kapso?.statuses?.at(-1);
    const firstError = lastStatus?.errors?.[0];
    logUpdate.error = firstError
      ? `${firstError.code}: ${firstError.message}`
      : 'Unknown error';
  }

  // Update message_logs by kapso_message_id
  const { data: logRow, error: logError } = await supabase
    .from('comm_message_logs')
    .update(logUpdate)
    .eq('kapso_message_id', kapsoMessageId)
    .select('broadcast_id')
    .single();

  if (logError) {
    // Message might not exist in logs (e.g., sent directly) — not a critical error
    console.warn('[status-update] log not found for', kapsoMessageId, logError.message);
    return NextResponse.json({ ok: true, warning: 'log not found' });
  }

  // If this message belongs to a broadcast, update aggregate counters
  if (logRow?.broadcast_id) {
    const broadcastId = logRow.broadcast_id;

    if (newStatus === 'sent') {
      await supabase.rpc('increment_broadcast_counter', {
        p_broadcast_id: broadcastId,
        p_column: 'enviados',
      });
    } else if (newStatus === 'delivered') {
      await supabase.rpc('increment_broadcast_counter', {
        p_broadcast_id: broadcastId,
        p_column: 'entregados',
      });
    } else if (newStatus === 'read') {
      await supabase.rpc('increment_broadcast_counter', {
        p_broadcast_id: broadcastId,
        p_column: 'leidos',
      });
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, kapso_message_id: kapsoMessageId });
}
