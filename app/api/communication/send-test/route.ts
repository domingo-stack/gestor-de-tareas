// POST /api/communication/send-test
// Sends an approved template to selected test contacts.

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
  const { templateId, contactIds } = await req.json();

  if (!templateId || !contactIds?.length) {
    return NextResponse.json({ error: 'templateId and contactIds required' }, { status: 400 });
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
  const { data: contacts } = await supabase
    .from('comm_test_contacts')
    .select('*')
    .in('id', contactIds);

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No se encontraron contactos' }, { status: 404 });
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

  // Only pass variables the template actually declares (Meta rejects extra params)
  const templateVarKeys: string[] = template.variables ?? [];

  // Send to each contact (parallel, capture individual results)
  const settled = await Promise.allSettled(
    contacts.map(async (contact) => {
      const allAvailable = { ...staticVars, ...(contact.variables ?? {}) };
      const variables = Object.fromEntries(
        templateVarKeys.map(key => [key, allAvailable[key] ?? ''])
      );
      await sendTemplateMessage({
        phoneNumberId,
        to: contact.phone,
        templateName,
        variables,
      });
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

  return NextResponse.json({ results });
}
