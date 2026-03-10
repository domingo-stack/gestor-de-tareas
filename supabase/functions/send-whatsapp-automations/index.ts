// send-whatsapp-automations
// Corre diariamente a las 9am UTC-5 (14:00 UTC) via pg_cron.
// Para cada regla activa de tipo "vencimiento", busca usuarios cuyo
// subscription_end coincide con hoy + timing_dias, y envía el template
// via Kapso WhatsApp API.
//
// Deploy: npx supabase functions deploy send-whatsapp-automations --no-verify-jwt
// Cron SQL (ejecutar en Supabase SQL Editor):
//   select cron.schedule(
//     'whatsapp-automations-daily',
//     '0 14 * * *',
//     $$ select net.http_post(
//       url := 'https://wowvnevmmeqaxcxmmemo.supabase.co/functions/v1/send-whatsapp-automations',
//       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
//       body := concat('{"cron_secret":"', current_setting('app.cron_secret'), '"}')::jsonb
//     ) $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const KAPSO_API_KEY     = Deno.env.get('KAPSO_API_KEY')!
const KAPSO_PHONE_ID    = Deno.env.get('KAPSO_PHONE_NUMBER_ID')!
const CRON_SECRET       = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Kapso: enviar mensaje individual con template ───────────────
async function sendKapsoMessage(
  to: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<string | null> {
  const components = Object.keys(variables).length > 0
    ? [{
        type: 'body',
        parameters: Object.entries(variables).map(([key, value]) => ({
          type: 'text',
          parameter_name: key,
          text: value,
        })),
      }]
    : undefined

  const res = await fetch(
    `https://api.kapso.ai/meta/whatsapp/v24.0/${KAPSO_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: { 'X-API-Key': KAPSO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          ...(components && { components }),
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Kapso error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data?.messages?.[0]?.id ?? null
}

// ─── Formatear fecha legible ─────────────────────────────────────
function formatFecha(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' })
}

// ─── Nombre del template en formato Kapso (snake_case) ──────────
function toTemplateName(nombre: string): string {
  return nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

// ─── Main ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  // Auth
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }

  const isTest = body?.test === true
  if (body?.cron_secret !== CRON_SECRET && !isTest) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Fecha de hoy en UTC-5
  const nowUTC5 = new Date(Date.now() - 5 * 60 * 60 * 1000)
  const today = nowUTC5.toISOString().split('T')[0] // YYYY-MM-DD

  // ── 1. Cargar reglas activas de vencimiento ──────────────────
  const { data: rules, error: rulesError } = await supabase
    .from('comm_event_rules')
    .select('id, nombre, timing_dias, template_id, comm_templates(nombre, estado)')
    .eq('evento_tipo', 'vencimiento')
    .eq('activo', true)

  if (rulesError || !rules || rules.length === 0) {
    return new Response(JSON.stringify({ message: 'No active vencimiento rules', rules: 0 }), { status: 200 })
  }

  const summary: Record<number, { rule: string; found: number; sent: number; errors: number }> = {}

  // ── 2. Para cada regla, buscar usuarios que vencen en timing_dias ──
  for (const rule of rules) {
    const template = rule.comm_templates as { nombre: string; estado: string } | null

    if (!template || template.estado !== 'aprobado') {
      console.log(`[rule ${rule.id}] skipped — template not approved`)
      continue
    }

    // Calcular la fecha objetivo: hoy + timing_dias
    const targetDate = new Date(nowUTC5)
    targetDate.setDate(targetDate.getDate() + rule.timing_dias)
    const targetDateStr = targetDate.toISOString().split('T')[0] // YYYY-MM-DD

    // Buscar usuarios pagados, no cancelados, con WhatsApp válido,
    // cuyo subscription_end cae en el día objetivo
    const { data: users, error: usersError } = await supabase
      .from('growth_users')
      .select('id, phone, first_name, subscription_end, plan_id')
      .eq('plan_paid', true)
      .eq('cancelled', false)
      .eq('whatsapp_valido', true)
      .gte('subscription_end', `${targetDateStr}T00:00:00+00:00`)
      .lt('subscription_end',  `${targetDateStr}T23:59:59+00:00`)
      .not('phone', 'is', null)

    if (usersError) {
      console.error(`[rule ${rule.id}] users query error:`, usersError.message)
      continue
    }

    summary[rule.id] = {
      rule: rule.nombre,
      found: users?.length ?? 0,
      sent: 0,
      errors: 0,
    }

    if (!users || users.length === 0) continue

    // ── 3. Enviar mensaje a cada usuario ──────────────────────
    const templateName = toTemplateName(template.nombre)

    for (const user of users) {
      // Verificar que no se le haya enviado ya este mensaje hoy (idempotencia)
      const { count } = await supabase
        .from('comm_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', user.id)
        .eq('template_id', rule.template_id)
        .gte('created_at', `${today}T00:00:00+00:00`)

      if ((count ?? 0) > 0) {
        console.log(`[rule ${rule.id}] skipping user ${user.id} — already sent today`)
        continue
      }

      const variables: Record<string, string> = {
        nombre:          user.first_name ?? '',
        dias_restantes:  String(rule.timing_dias),
        fecha_fin:       formatFecha(user.subscription_end),
        link_renovacion: 'https://califica.ai/renovar',
      }

      try {
        const kapsoId = await sendKapsoMessage(user.phone!, templateName, variables)

        await supabase.from('comm_message_logs').insert({
          contact_id:       user.id,
          template_id:      rule.template_id,
          evento_tipo:      'vencimiento',
          kapso_message_id: kapsoId,
          estado:           'sent',
          created_at:       new Date().toISOString(),
        })

        summary[rule.id].sent++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[rule ${rule.id}] send error for user ${user.id}:`, msg)

        await supabase.from('comm_message_logs').insert({
          contact_id:       user.id,
          template_id:      rule.template_id,
          evento_tipo:      'vencimiento',
          kapso_message_id: null,
          estado:           'failed',
          error:            msg,
          created_at:       new Date().toISOString(),
        })

        summary[rule.id].errors++
      }
    }
  }

  const totalSent = Object.values(summary).reduce((s, r) => s + r.sent, 0)
  const totalErrors = Object.values(summary).reduce((s, r) => s + r.errors, 0)

  console.log(`[send-whatsapp-automations] done — sent: ${totalSent}, errors: ${totalErrors}`)

  return new Response(
    JSON.stringify({ ok: true, date: today, summary, totalSent, totalErrors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
