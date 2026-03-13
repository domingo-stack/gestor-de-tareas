// POST /api/communication/status-update
// Called by Kapso webhooks for ALL events: status changes + incoming messages.
// Kapso payload: { message: { id, to, kapso: { status } }, conversation: { phone_number }, ... }
// Event type comes from x-webhook-event header.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { sendTextMessage } from '@/lib/kapso';

const KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET!;
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID!;

const DEFAULT_AUTO_REPLY =
  'Gracias por tu mensaje 🙏\n\n' +
  'Este es un canal de difusión y no monitoreamos las respuestas.\n\n' +
  'Para ponerte en contacto con nuestro equipo, escríbenos al número oficial de soporte.\n\n' +
  'Muchas gracias y disculpa las molestias.';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Verify Kapso HMAC signature
function verifySignature(rawBody: string, signature: string): boolean {
  if (!KAPSO_WEBHOOK_SECRET || KAPSO_WEBHOOK_SECRET === 'pendiente') return true;
  const expected = createHmac('sha256', KAPSO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return signature === expected;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature') ?? '';
  const event = req.headers.get('x-webhook-event') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Kapso sends: { message: {...}, conversation: {...}, phone_number_id }
  // NOT { data: { message: {...} } }
  const message = payload.message;
  const conversation = payload.conversation;

  // ── Handle incoming messages (auto-reply) ──────────────────
  if (event === 'whatsapp.message.received' || event === 'message.received') {
    const senderPhone = message?.from ?? conversation?.phone_number;

    if (!senderPhone) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'no sender phone' });
    }

    const supabase = getSupabase();

    // Check auto-reply config
    const { data: configRows } = await supabase
      .from('comm_variables')
      .select('key, value')
      .in('key', ['auto_reply_enabled', 'auto_reply_message', 'auto_reply_support_number', 'auto_reply_support_url']);

    const config: Record<string, string> = {};
    (configRows ?? []).forEach((r: { key: string; value: string }) => { config[r.key] = r.value; });

    if (config.auto_reply_enabled === 'false') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'auto-reply disabled' });
    }

    // 24h cooldown per phone
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('comm_message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('phone', senderPhone)
      .eq('evento_tipo', 'auto_reply')
      .gte('created_at', since);

    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'cooldown 24h' });
    }

    // Build reply
    let replyText = config.auto_reply_message || DEFAULT_AUTO_REPLY;
    if (config.auto_reply_support_url) {
      replyText += `\n\n👉 ${config.auto_reply_support_url}`;
    } else if (config.auto_reply_support_number) {
      replyText += `\n\n📞 ${config.auto_reply_support_number}`;
    }

    try {
      const result = await sendTextMessage({
        phoneNumberId: KAPSO_PHONE_NUMBER_ID,
        to: senderPhone,
        text: replyText,
      });

      await supabase.from('comm_message_logs').insert({
        phone: senderPhone,
        kapso_message_id: result.messages?.[0]?.id ?? null,
        evento_tipo: 'auto_reply',
        estado: 'sent',
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, auto_reply_sent: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[status-update] auto-reply error:', errMsg);

      await supabase.from('comm_message_logs').insert({
        phone: senderPhone,
        evento_tipo: 'auto_reply',
        estado: 'failed',
        error: errMsg,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
    }
  }

  // ── Handle status updates ─────────────────────────────────
  const kapsoMessageId = message?.id;

  if (!kapsoMessageId) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no message id' });
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
    return NextResponse.json({ ok: true, ignored: true, reason: `unknown event: ${event}` });
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
    return NextResponse.json({ ok: true, warning: 'log not found' });
  }

  // If this message belongs to a broadcast, update aggregate counters
  if (logRow?.broadcast_id) {
    const broadcastId = logRow.broadcast_id;
    const counterMap: Record<string, string> = {
      sent: 'enviados',
      delivered: 'entregados',
      read: 'leidos',
    };
    const col = counterMap[newStatus];
    if (col) {
      await supabase.rpc('increment_broadcast_counter', {
        p_broadcast_id: broadcastId,
        p_column: col,
      });
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, kapso_message_id: kapsoMessageId });
}
