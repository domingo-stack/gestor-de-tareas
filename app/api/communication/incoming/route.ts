// POST /api/communication/incoming
// Handles incoming WhatsApp messages via Kapso webhook.
// Sends an auto-reply directing users to the official support number.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTextMessage } from '@/lib/kapso';

const KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET!;
const KAPSO_PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID!;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Simple signature check (same as status-update)
function verifySignature(rawBody: string, signature: string): boolean {
  if (KAPSO_WEBHOOK_SECRET === 'pendiente') return true;
  const { createHmac } = require('crypto');
  const expected = createHmac('sha256', KAPSO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return signature === expected;
}

// Default auto-reply message
const DEFAULT_AUTO_REPLY =
  'Gracias por tu mensaje 🙏\n\n' +
  'Este es un canal de difusión y no monitoreamos las respuestas.\n\n' +
  'Para ponerte en contacto con nuestro equipo, escríbenos al número oficial de soporte.\n\n' +
  'Muchas gracias y disculpa las molestias.';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    event?: string;
    data?: {
      message?: {
        id?: string;
        from?: string;
        text?: { body?: string };
        type?: string;
      };
      conversation?: {
        phone_number?: string;
      };
    };
    // Meta Cloud API format (direct from Meta)
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            text?: { body?: string };
            type?: string;
          }>;
        };
      }>;
    }>;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Extract sender phone - handle both Kapso and Meta webhook formats
  let senderPhone: string | undefined;
  let messageId: string | undefined;
  let messageText: string | undefined;

  if (payload.data?.message) {
    // Kapso format
    senderPhone = payload.data.message.from;
    messageId = payload.data.message.id;
    messageText = payload.data.message.text?.body;
  } else if (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    // Meta Cloud API format
    const msg = payload.entry[0].changes[0].value.messages[0];
    senderPhone = msg.from;
    messageId = msg.id;
    messageText = msg.text?.body;
  }

  const event = payload.event ?? '';

  // Only handle actual incoming messages, not status updates
  if (!senderPhone) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no sender phone' });
  }

  const supabase = getSupabase();

  // Check if auto-reply is enabled and get custom message
  const { data: configRows } = await supabase
    .from('comm_variables')
    .select('key, value')
    .in('key', ['auto_reply_enabled', 'auto_reply_message', 'auto_reply_support_number']);

  const config: Record<string, string> = {};
  (configRows ?? []).forEach(r => { config[r.key] = r.value; });

  const autoReplyEnabled = config.auto_reply_enabled !== 'false'; // enabled by default
  if (!autoReplyEnabled) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'auto-reply disabled' });
  }

  // Check cooldown: don't send auto-reply if we already replied to this number in last 24h
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

  // Build the auto-reply message
  let replyText = config.auto_reply_message || DEFAULT_AUTO_REPLY;
  if (config.auto_reply_support_number) {
    replyText = replyText.replace(
      'número oficial de soporte',
      `número oficial de soporte: ${config.auto_reply_support_number}`
    );
  }

  // Send auto-reply
  try {
    const result = await sendTextMessage({
      phoneNumberId: KAPSO_PHONE_NUMBER_ID,
      to: senderPhone,
      text: replyText,
    });

    // Log the auto-reply
    await supabase.from('comm_message_logs').insert({
      phone: senderPhone,
      kapso_message_id: result.messages?.[0]?.id ?? null,
      evento_tipo: 'auto_reply',
      estado: 'sent',
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, auto_reply_sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[incoming] auto-reply error:', message);

    // Log the failed attempt
    await supabase.from('comm_message_logs').insert({
      phone: senderPhone,
      evento_tipo: 'auto_reply',
      estado: 'failed',
      error: message,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
