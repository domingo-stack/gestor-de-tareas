// POST /api/communication/send-test
// Sends an approved template to selected test contacts.
// Optionally creates a temporary broadcast for auto-reply testing.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTemplateMessage } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { templateId, contactIds, autoReplyMessage } = await req.json();

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch template
  const { data: template, error: tError } = await supabase
    .from('comm_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (tError || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.estado !== 'aprobado') {
    return NextResponse.json({ error: 'El template debe estar aprobado por Meta' }, { status: 400 });
  }

  // Fetch test contacts
  let contactsQuery = supabase.from('comm_test_contacts').select('*');
  if (contactIds?.length) {
    contactsQuery = contactsQuery.in('id', contactIds);
  }
  const { data: contacts } = await contactsQuery;

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No se encontraron contactos de prueba' }, { status: 404 });
  }

  // If auto-reply is set, create a temporary broadcast to hold the auto_reply_message
  let testBroadcastId: number | null = null;
  if (autoReplyMessage) {
    const { data: broadcast } = await supabase
      .from('comm_broadcasts')
      .insert({
        nombre: `[TEST] ${template.nombre} - ${new Date().toISOString().slice(0, 16)}`,
        template_id: template.id,
        estado: 'completado',
        total_destinatarios: contacts.length,
        auto_reply_message: autoReplyMessage,
      })
      .select('id')
      .single();

    if (broadcast) testBroadcastId = broadcast.id;
  }

  // Fetch static comm_variables
  const { data: commVars } = await supabase
    .from('comm_variables')
    .select('key, value');

  const staticVars = Object.fromEntries(
    (commVars ?? []).map((v: { key: string; value: string }) => [v.key, v.value])
  );

  const templateName = template.nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID!;
  const templateVarKeys: string[] = template.variables ?? [];

  // Send to each contact
  const settled = await Promise.allSettled(
    contacts.map(async (contact) => {
      const allAvailable = { ...staticVars, ...(contact.variables ?? {}) };
      const variables = Object.fromEntries(
        templateVarKeys.map(key => [key, allAvailable[key] ?? ''])
      );
      const result = await sendTemplateMessage({
        phoneNumberId,
        to: contact.phone,
        templateName,
        variables,
      });

      // Log the message so incoming route can find the broadcast for auto-reply
      if (testBroadcastId) {
        const digits = contact.phone.replace(/[^0-9]/g, '');
        await supabase.from('comm_message_logs').insert({
          phone: digits,
          broadcast_id: testBroadcastId,
          template_id: template.id,
          kapso_message_id: result?.messages?.[0]?.id ?? null,
          estado: 'sent',
        });
      }

      return contact.id;
    })
  );

  const results = settled.map((r, i) => ({
    contactId: contacts[i].id,
    ok: r.status === 'fulfilled',
    error: r.status === 'rejected'
      ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
      : null,
  }));

  return NextResponse.json({ results, testBroadcastId });
}
