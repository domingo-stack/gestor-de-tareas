// ─────────────────────────────────────────────────────────────
// Kapso WhatsApp API helper
// Docs: https://docs.kapso.ai
// ─────────────────────────────────────────────────────────────

const KAPSO_BASE_PLATFORM = 'https://api.kapso.ai/platform/v1';
const KAPSO_BASE_META     = 'https://api.kapso.ai/meta/whatsapp/v24.0';

const KAPSO_API_KEY  = process.env.KAPSO_API_KEY!;
const KAPSO_WABA_ID  = process.env.KAPSO_WABA_ID!;

function headers() {
  return {
    'X-API-Key': KAPSO_API_KEY,
    'Content-Type': 'application/json',
  };
}

// ─────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────

/**
 * Submits a template to Meta for approval via Kapso.
 * Returns the Kapso/Meta template id.
 */
export async function submitTemplateToMeta({
  nombre,
  body,
  variables,
  categoria,
  language = 'es',
}: {
  nombre: string;
  body: string;
  variables: string[];
  categoria: 'utility' | 'marketing';
  language?: string;
}) {
  // Build named parameters examples from variable names
  const bodyTextNamedParams = variables.map(v => ({
    param_name: v,
    example: `[${v}]`,
  }));

  const components: object[] = [
    {
      type: 'BODY',
      text: body,
      ...(variables.length > 0 && {
        example: { body_text_named_params: bodyTextNamedParams },
      }),
    },
  ];

  const res = await fetch(
    `${KAPSO_BASE_META}/${KAPSO_WABA_ID}/message_templates`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: nombre.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // á→a, ñ→n, etc.
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, ''),
        category: categoria.toUpperCase(),
        language,
        parameter_format: variables.length > 0 ? 'NAMED' : 'POSITIONAL',
        components,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso template submit error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Kapso/Meta returns { id, status } — id is the Meta template id
  return data as { id: string; status: string };
}

// ─────────────────────────────────────────────────────────────
// BROADCASTS
// ─────────────────────────────────────────────────────────────

/**
 * Creates a broadcast in Kapso and returns its id.
 */
export async function createBroadcast(name: string, templateName: string, language = 'es') {
  const res = await fetch(`${KAPSO_BASE_PLATFORM}/whatsapp/broadcasts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      whatsapp_broadcast: {
        name,
        template_name: templateName,
        template_language: language,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso create broadcast error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data as { id: string; name: string; status: string };
}

/**
 * Adds recipients to an existing broadcast (max 1000 per call).
 * Each recipient has a phone_number and optional variable components.
 */
export async function addBroadcastRecipients(
  broadcastId: string,
  recipients: Array<{
    phone_number: string;
    variables?: Record<string, string>;
  }>
) {
  const mapped = recipients.map(r => ({
    phone_number: normalizePhone(r.phone_number),
    ...(r.variables && Object.keys(r.variables).length > 0 && {
      components: [
        {
          type: 'body',
          parameters: Object.entries(r.variables).map(([key, value]) => ({
            type: 'text',
            parameter_name: key,
            text: value,
          })),
        },
      ],
    }),
  }));

  const res = await fetch(
    `${KAPSO_BASE_PLATFORM}/whatsapp/broadcasts/${broadcastId}/recipients`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ whatsapp_broadcast: { recipients: mapped } }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso add recipients error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data as { added: number; duplicates: number; errors: unknown[] };
}

/**
 * Sends a broadcast immediately.
 */
export async function sendBroadcast(broadcastId: string) {
  const res = await fetch(
    `${KAPSO_BASE_PLATFORM}/whatsapp/broadcasts/${broadcastId}/send`,
    { method: 'POST', headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso send broadcast error ${res.status}: ${err}`);
  }

  return await res.json();
}

/**
 * Gets the current approval status of a template from Meta via Kapso.
 * Queries the WABA templates list and filters by template ID.
 */
export async function getTemplateStatus(kapsoTemplateId: string) {
  // Use the same WABA-level endpoint as submission, but GET to list templates
  const res = await fetch(
    `${KAPSO_BASE_META}/${KAPSO_WABA_ID}/message_templates?fields=id,name,status,rejected_reason&limit=100`,
    { method: 'GET', headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso list templates error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Meta returns { data: [...templates] }
  const templates: Array<{ id: string; name: string; status: string; rejected_reason?: string }> =
    data.data ?? data ?? [];

  const found = templates.find(t => t.id === kapsoTemplateId);
  if (!found) {
    throw new Error(`Template ${kapsoTemplateId} not found in Meta account`);
  }

  return found;
}

/**
 * Sends a single WhatsApp message using a template (for automations).
 */
/** Normalizes a phone number to E.164 digits only (no + or spaces). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function sendTemplateMessage({
  phoneNumberId,
  to,
  templateName,
  language = 'es',
  variables = {},
}: {
  phoneNumberId: string;
  to: string;
  templateName: string;
  language?: string;
  variables?: Record<string, string>;
}) {
  to = normalizePhone(to);
  const components = Object.keys(variables).length > 0
    ? [{
        type: 'body',
        parameters: Object.entries(variables).map(([key, value]) => ({
          type: 'text',
          parameter_name: key,
          text: value,
        })),
      }]
    : undefined;

  const res = await fetch(
    `${KAPSO_BASE_META}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components && { components }),
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso send message error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data as { messages: Array<{ id: string }> };
}
