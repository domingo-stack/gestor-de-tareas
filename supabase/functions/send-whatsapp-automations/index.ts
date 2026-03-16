// send-whatsapp-automations
// Corre diariamente a las 9am UTC-5 (14:00 UTC) via pg_cron.
// Procesa dos tipos de reglas:
//   1. "vencimiento" — usuarios pagados cuyo subscription_end coincide con hoy ± timing_dias
//   2. "activacion"  — usuarios free/cancelados con alta actividad (eventos_valor >= umbral en periodo)
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

// ─── Types ──────────────────────────────────────────────────────
interface SegmentoFiltros {
  paises?: string[]
  plan_ids?: string[]
  audiencia?: 'free' | 'cancelled' | 'ambos'
  eventos_min?: number
  periodo_dias?: number
  cooldown_dias?: number
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

  // Cargar comm_variables para variables estáticas (link_renovacion, etc.)
  const { data: commVars } = await supabase.from('comm_variables').select('key, value')
  const staticVars: Record<string, string> = Object.fromEntries(
    (commVars ?? []).map((v: { key: string; value: string }) => [v.key, v.value])
  )

  const summary: Record<string, { rule: string; tipo: string; found: number; sent: number; errors: number }> = {}

  // ════════════════════════════════════════════════════════════════
  // 1. VENCIMIENTO RULES
  // ════════════════════════════════════════════════════════════════
  const { data: vencRules } = await supabase
    .from('comm_event_rules')
    .select('id, nombre, timing_dias, timing_direction, template_id, segmento_filtros, comm_templates(nombre, estado, variables)')
    .eq('evento_tipo', 'vencimiento')
    .eq('activo', true)

  for (const rule of vencRules ?? []) {
    const template = rule.comm_templates as { nombre: string; estado: string; variables: string[] } | null
    if (!template || template.estado !== 'aprobado') {
      console.log(`[venc ${rule.id}] skipped — template not approved`)
      continue
    }

    const segmento: SegmentoFiltros = rule.segmento_filtros ?? {}

    // Calcular fecha objetivo
    const targetDate = new Date(nowUTC5)
    const offset = rule.timing_direction === 'after' ? -rule.timing_dias : rule.timing_dias
    targetDate.setDate(targetDate.getDate() + offset)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    let usersQuery = supabase
      .from('growth_users')
      .select('id, phone, first_name, subscription_end, plan_id, country')
      .eq('plan_paid', true)
      .eq('cancelled', false)
      .eq('whatsapp_valido', true)
      .gte('subscription_end', `${targetDateStr}T00:00:00+00:00`)
      .lt('subscription_end', `${targetDateStr}T23:59:59+00:00`)
      .not('phone', 'is', null)

    if (segmento.paises && segmento.paises.length > 0) {
      usersQuery = usersQuery.in('country', segmento.paises)
    }
    if (segmento.plan_ids && segmento.plan_ids.length > 0) {
      usersQuery = usersQuery.in('plan_id', segmento.plan_ids)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      console.error(`[venc ${rule.id}] users query error:`, usersError.message)
      continue
    }

    summary[rule.id] = { rule: rule.nombre, tipo: 'vencimiento', found: users?.length ?? 0, sent: 0, errors: 0 }
    if (!users || users.length === 0) continue

    const templateName = toTemplateName(template.nombre)

    for (const user of users) {
      // Idempotencia: no enviar si ya se envió hoy
      const { count } = await supabase
        .from('comm_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', user.id)
        .eq('template_id', rule.template_id)
        .gte('created_at', `${today}T00:00:00+00:00`)

      if ((count ?? 0) > 0) continue

      const allVars: Record<string, string> = {
        ...staticVars,
        nombre: user.first_name ?? '',
        plan_id: user.plan_id ?? '',
        dias_restantes: String(rule.timing_dias),
        fecha_fin: formatFecha(user.subscription_end),
      }
      const templateVarKeys: string[] = template.variables ?? []
      const variables = Object.fromEntries(
        templateVarKeys.map(key => [key, allVars[key] ?? ''])
      )

      try {
        const kapsoId = await sendKapsoMessage(user.phone!, templateName, variables)
        await supabase.from('comm_message_logs').insert({
          contact_id: user.id,
          template_id: rule.template_id,
          evento_tipo: 'vencimiento',
          kapso_message_id: kapsoId,
          estado: 'sent',
          created_at: new Date().toISOString(),
        })
        summary[rule.id].sent++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[venc ${rule.id}] send error for ${user.id}:`, msg)
        await supabase.from('comm_message_logs').insert({
          contact_id: user.id,
          template_id: rule.template_id,
          evento_tipo: 'vencimiento',
          kapso_message_id: null,
          estado: 'failed',
          error: msg,
          created_at: new Date().toISOString(),
        })
        summary[rule.id].errors++
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. ACTIVACION RULES (comportamiento de usuarios free/cancelled)
  // ════════════════════════════════════════════════════════════════
  const { data: actRules } = await supabase
    .from('comm_event_rules')
    .select('id, nombre, template_id, segmento_filtros, comm_templates(nombre, estado, variables)')
    .eq('evento_tipo', 'activacion')
    .eq('activo', true)

  for (const rule of actRules ?? []) {
    const template = rule.comm_templates as { nombre: string; estado: string; variables: string[] } | null
    if (!template || template.estado !== 'aprobado') {
      console.log(`[act ${rule.id}] skipped — template not approved`)
      continue
    }

    const seg: SegmentoFiltros = rule.segmento_filtros ?? {}
    const eventosMin = seg.eventos_min ?? 10
    const cooldownDias = seg.cooldown_dias ?? 30
    const audiencia = seg.audiencia ?? 'ambos'

    // Build user query based on audiencia
    let usersQuery = supabase
      .from('growth_users')
      .select('id, phone, first_name, plan_id, country, eventos_valor')
      .eq('whatsapp_valido', true)
      .not('phone', 'is', null)
      .gte('eventos_valor', eventosMin)

    // Audiencia filter
    if (audiencia === 'free') {
      usersQuery = usersQuery.eq('plan_free', true)
    } else if (audiencia === 'cancelled') {
      usersQuery = usersQuery.eq('cancelled', true)
    } else {
      // ambos: free OR cancelled — use .or()
      usersQuery = usersQuery.or('plan_free.eq.true,cancelled.eq.true')
    }

    // Country/plan filters
    if (seg.paises && seg.paises.length > 0) {
      usersQuery = usersQuery.in('country', seg.paises)
    }
    if (seg.plan_ids && seg.plan_ids.length > 0) {
      usersQuery = usersQuery.in('plan_id', seg.plan_ids)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      console.error(`[act ${rule.id}] users query error:`, usersError.message)
      continue
    }

    summary[rule.id] = { rule: rule.nombre, tipo: 'activacion', found: users?.length ?? 0, sent: 0, errors: 0 }
    if (!users || users.length === 0) continue

    const templateName = toTemplateName(template.nombre)

    // Cooldown cutoff date
    const cooldownDate = new Date(nowUTC5)
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDias)
    const cooldownDateStr = cooldownDate.toISOString()

    for (const user of users) {
      // Cooldown: skip if already sent this template within cooldown period
      const { count } = await supabase
        .from('comm_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', user.id)
        .eq('template_id', rule.template_id)
        .eq('estado', 'sent')
        .gte('created_at', cooldownDateStr)

      if ((count ?? 0) > 0) continue

      const allVars: Record<string, string> = {
        ...staticVars,
        nombre: user.first_name ?? '',
        plan_id: user.plan_id ?? '',
        eventos: String(user.eventos_valor ?? 0),
      }
      const templateVarKeys: string[] = template.variables ?? []
      const variables = Object.fromEntries(
        templateVarKeys.map(key => [key, allVars[key] ?? ''])
      )

      try {
        const kapsoId = await sendKapsoMessage(user.phone!, templateName, variables)
        await supabase.from('comm_message_logs').insert({
          contact_id: user.id,
          template_id: rule.template_id,
          evento_tipo: 'activacion',
          kapso_message_id: kapsoId,
          estado: 'sent',
          created_at: new Date().toISOString(),
        })
        summary[rule.id].sent++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[act ${rule.id}] send error for ${user.id}:`, msg)
        await supabase.from('comm_message_logs').insert({
          contact_id: user.id,
          template_id: rule.template_id,
          evento_tipo: 'activacion',
          kapso_message_id: null,
          estado: 'failed',
          error: msg,
          created_at: new Date().toISOString(),
        })
        summary[rule.id].errors++
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  const totalSent = Object.values(summary).reduce((s, r) => s + r.sent, 0)
  const totalErrors = Object.values(summary).reduce((s, r) => s + r.errors, 0)

  console.log(`[send-whatsapp-automations] done — sent: ${totalSent}, errors: ${totalErrors}`)

  return new Response(
    JSON.stringify({ ok: true, date: today, summary, totalSent, totalErrors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
