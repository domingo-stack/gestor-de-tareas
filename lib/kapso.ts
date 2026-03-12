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
 * Button definition for WhatsApp templates.
 * Meta allows: up to 2 CTA buttons (URL/PHONE_NUMBER) OR up to 3 QUICK_REPLY buttons.
 */
export interface TemplateButton {
  type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';
  text: string;
  url?: string;           // only for URL type
  phone_number?: string;  // only for PHONE_NUMBER type
}

/**
 * Submits a template to Meta for approval via Kapso.
 * Returns the Kapso/Meta template id.
 */
export async function submitTemplateToMeta({
  nombre,
  body,
  variables,
  categoria,
  buttons = [],
  language = 'es',
}: {
  nombre: string;
  body: string;
  variables: string[];
  categoria: 'utility' | 'marketing';
  buttons?: TemplateButton[];
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

  // Add buttons component if any buttons are defined
  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map(btn => {
        if (btn.type === 'URL') {
          return { type: 'URL', text: btn.text, url: btn.url };
        }
        if (btn.type === 'PHONE_NUMBER') {
          return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
        }
        // QUICK_REPLY
        return { type: 'QUICK_REPLY', text: btn.text };
      }),
    });
  }

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
    `${KAPSO_BASE_META}/${KAPSO_WABA_ID}/message_templates?fields=id,name,status,category,rejected_reason&limit=100`,
    { method: 'GET', headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso list templates error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Meta returns { data: [...templates] }
  const templates: Array<{ id: string; name: string; status: string; category?: string; rejected_reason?: string }> =
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

/**
 * Deletes a template from Meta via Kapso.
 * Uses the template name (not ID) as Meta requires.
 */
export async function deleteTemplateFromMeta(templateName: string) {
  const res = await fetch(
    `${KAPSO_BASE_META}/${KAPSO_WABA_ID}/message_templates?name=${encodeURIComponent(templateName)}`,
    { method: 'DELETE', headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso delete template error ${res.status}: ${err}`);
  }

  return await res.json();
}

/**
 * Sends a free-form text message (not a template).
 * Only works within the 24h conversation window (user must have messaged first).
 */
export async function sendTextMessage({
  phoneNumberId,
  to,
  text,
}: {
  phoneNumberId: string;
  to: string;
  text: string;
}) {
  to = normalizePhone(to);

  const res = await fetch(
    `${KAPSO_BASE_META}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kapso send text error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data as { messages: Array<{ id: string }> };
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
