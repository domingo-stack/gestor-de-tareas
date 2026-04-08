// ============================================================================
// sync-crm-leads — Pull leads desde la API externa de Califica al CRM
// ============================================================================
// Trigger: cron externo cada 5 min, OR manual desde el tab Reportes/Config.
//
// Body contract:
//   {}                  → cron invocation. Requiere x-cron-secret header o ?secret=
//   { manual: true }    → invocación manual desde la UI. Requiere user JWT (Bearer)
//                          y rol superadmin (verificado via supabaseAdmin.auth.getUser)
//
// Flow:
//   1. Auth (cron secret OR user JWT + superadmin)
//   2. Leer last successful sync timestamp desde crm_sync_log
//   3. GET https://califica.ai/api/leads?since=<lastSync>&limit=500&page=N
//      con paginación hasta agotar
//   4. Para cada lead: INSERT con ON CONFLICT (external_id) DO NOTHING
//   5. Para cada nuevo lead insertado: notification via get_notification_recipients
//   6. Loggear en crm_sync_log
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

// Lookup table: ISO country code → nombre (consistente con módulo growth)
const COUNTRY_MAP: Record<string, string> = {
  PE: 'Perú', MX: 'México', CL: 'Chile', CO: 'Colombia', AR: 'Argentina',
  EC: 'Ecuador', BO: 'Bolivia', VE: 'Venezuela', UY: 'Uruguay', PY: 'Paraguay',
  CR: 'Costa Rica', PA: 'Panamá', GT: 'Guatemala', HN: 'Honduras', SV: 'El Salvador',
  NI: 'Nicaragua', DO: 'República Dominicana', CU: 'Cuba', ES: 'España',
  US: 'Estados Unidos', BR: 'Brasil',
  OTHER: 'Otro',
};

interface ExternalLead {
  id: string;
  name?: string;
  email?: string;
  institution?: string;
  phone?: string;
  country?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  role?: string; // pendiente del dev de la API
  created_at?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Insertar log de sync inicial (status='running')
  const { data: logRow, error: logInsertError } = await supabaseAdmin
    .from('crm_sync_log')
    .insert({ status: 'running' })
    .select()
    .single();

  if (logInsertError) {
    return new Response(
      JSON.stringify({ error: 'Failed to create sync log row', detail: logInsertError.message }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
  const logId = logRow.id;

  const updateLog = async (updates: Record<string, unknown>) => {
    await supabaseAdmin
      .from('crm_sync_log')
      .update({ ...updates, finished_at: new Date().toISOString() })
      .eq('id', logId);
  };

  try {
    // Parse body
    let body: { manual?: boolean } = {};
    try {
      body = await req.clone().json();
    } catch { /* no body */ }

    // ===== Auth =====
    if (body.manual) {
      // Manual: requiere user JWT + superadmin
      const authHeader = req.headers.get('authorization') || '';
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) {
        await updateLog({ status: 'error', error_message: 'Manual sync requires user JWT' });
        return new Response(JSON.stringify({ error: 'Manual sync requires Bearer JWT' }), { status: 401, headers: JSON_HEADERS });
      }
      const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
      if (authError || !userData?.user) {
        await updateLog({ status: 'error', error_message: 'Invalid user token' });
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: JSON_HEADERS });
      }
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (!profileData || profileData.role !== 'superadmin') {
        await updateLog({ status: 'error', error_message: 'Manual sync requires superadmin role' });
        return new Response(JSON.stringify({ error: 'Requires superadmin' }), { status: 403, headers: JSON_HEADERS });
      }
    } else {
      // Cron: requiere CRON_SECRET
      const cronSecret = Deno.env.get('CRON_SECRET');
      const url = new URL(req.url);
      const querySecret = url.searchParams.get('secret') || '';
      const headerSecret = req.headers.get('x-cron-secret') || '';
      if (cronSecret && headerSecret !== cronSecret && querySecret !== cronSecret) {
        await updateLog({ status: 'error', error_message: 'Unauthorized cron invocation' });
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
      }
    }

    // ===== Config =====
    const apiUrl = Deno.env.get('LEADS_API_URL');
    const apiToken = Deno.env.get('LEADS_API_TOKEN');
    if (!apiUrl || !apiToken) {
      await updateLog({
        status: 'error',
        error_message: 'LEADS_API_URL or LEADS_API_TOKEN not configured in Edge Function secrets',
      });
      return new Response(
        JSON.stringify({ error: 'Missing API config in Edge Function secrets' }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    // ===== Since timestamp =====
    // Manual: traer los últimos 90 días siempre. Esto permite re-procesar leads
    // existentes para que el backfill llene country/phone/position cuando la API
    // los empieza a mandar (ej: lead viejo sin country, ahora viene con país).
    // Cron: usa el último sync exitoso para ser incremental y eficiente.
    let sinceDate: Date;
    if (body.manual) {
      sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    } else {
      const { data: lastSync } = await supabaseAdmin
        .from('crm_sync_log')
        .select('finished_at')
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sinceDate = lastSync?.finished_at
        ? new Date(lastSync.finished_at)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    const sinceISO = sinceDate.toISOString();

    // ===== Default stage_id =====
    const { data: defaultStage } = await supabaseAdmin
      .from('crm_pipeline_stages')
      .select('id')
      .eq('is_default_entry', true)
      .limit(1)
      .maybeSingle();
    if (!defaultStage) {
      await updateLog({
        status: 'error',
        error_message: 'No default entry stage configured (is_default_entry = true)',
      });
      return new Response(
        JSON.stringify({ error: 'No default stage' }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
    const defaultStageId = defaultStage.id;

    // ===== Pull paginado =====
    let totalFetched = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let page = 1;
    const limit = 500;
    const newLeadIds: string[] = [];

    while (true) {
      const url = `${apiUrl.replace(/\/$/, '')}?since=${encodeURIComponent(sinceISO)}&limit=${limit}&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errText = await response.text();
        await updateLog({
          status: 'error',
          leads_fetched: totalFetched,
          leads_inserted: totalInserted,
          leads_skipped: totalSkipped,
          error_message: `API returned ${response.status}: ${errText.slice(0, 200)}`,
        });
        return new Response(
          JSON.stringify({ error: `External API failed: ${response.status}`, detail: errText.slice(0, 500) }),
          { status: 502, headers: JSON_HEADERS },
        );
      }
      const payload: { data?: ExternalLead[]; total?: number; page?: number } = await response.json();
      const batch = payload.data ?? [];
      if (batch.length === 0) break;
      totalFetched += batch.length;

      // Mapear y insertar batch
      const rows = batch.map(lead => ({
        external_id: lead.id,
        external_source: lead.source ?? 'landings_api',
        full_name: lead.name ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        company: lead.institution ?? null,
        position: lead.role ?? null, // pendiente que el dev lo agregue
        country: lead.country ? (COUNTRY_MAP[lead.country.toUpperCase()] ?? lead.country) : null,
        landing_url: lead.source ?? null,
        utm_source: lead.utm_source ?? null,
        utm_medium: lead.utm_medium ?? null,
        utm_campaign: lead.utm_campaign ?? null,
        form_payload: lead as unknown as Record<string, unknown>,
        stage_id: defaultStageId,
        original_created_at: lead.created_at ?? null,
      }));

      // INSERT con ON CONFLICT — supabase-js no soporta directamente "ON CONFLICT DO NOTHING"
      // pero podemos usar upsert con onConflict: 'external_id' + ignoreDuplicates: true
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('crm_leads')
        .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
        .select('id, external_id');

      if (insertError) {
        await updateLog({
          status: 'error',
          leads_fetched: totalFetched,
          leads_inserted: totalInserted,
          leads_skipped: totalSkipped,
          error_message: `Insert failed at page ${page}: ${insertError.message}`,
        });
        return new Response(
          JSON.stringify({ error: 'DB insert failed', detail: insertError.message }),
          { status: 500, headers: JSON_HEADERS },
        );
      }

      const insertedCount = inserted?.length ?? 0;
      totalInserted += insertedCount;
      totalSkipped += batch.length - insertedCount;
      if (inserted) {
        newLeadIds.push(...inserted.map(r => r.id));
      }

      // Backfill: actualizar country/phone/position de TODOS los leads del batch
      // donde el campo esté null en DB. Esto cubre los leads históricos que se
      // sincronizaron antes de que la API mandara estos campos. Como usamos
      // .is(field, null), es idempotente y NO pisa datos editados manualmente.
      let backfillCount = 0;
      for (const lead of batch) {
        const patch: Record<string, unknown> = {};
        if (lead.country) {
          patch.country = COUNTRY_MAP[lead.country.toUpperCase()] ?? lead.country;
        }
        if (lead.phone) patch.phone = lead.phone;
        if (lead.role) patch.position = lead.role;
        if (Object.keys(patch).length === 0) continue;

        for (const [field, value] of Object.entries(patch)) {
          const { error: backfillErr, count } = await supabaseAdmin
            .from('crm_leads')
            .update({ [field]: value }, { count: 'exact' })
            .eq('external_id', lead.id)
            .is(field, null);
          if (backfillErr) {
            console.error('Backfill error:', backfillErr.message);
          } else if (count && count > 0) {
            backfillCount += count;
          }
        }
      }
      if (backfillCount > 0) {
        console.log(`Backfilled ${backfillCount} fields in page ${page}`);
      }

      // Si retornó menos que el limit, fue la última página
      if (batch.length < limit) break;
      page++;
      // Safety: no más de 50 páginas (25k leads por sync)
      if (page > 50) break;
    }

    // ===== Notificaciones para los nuevos leads =====
    let notifSent = 0;
    if (newLeadIds.length > 0) {
      try {
        // Obtener recipients de notification_preferences
        const { data: recipients } = await supabaseAdmin.rpc('get_notification_recipients', { p_notification_type: 'crm_lead_new' });
        if (recipients && recipients.length > 0) {
          // Para cada nuevo lead, obtener los datos básicos para el mensaje
          const { data: leadData } = await supabaseAdmin
            .from('crm_leads')
            .select('id, full_name, company, email')
            .in('id', newLeadIds);

          const notifications: Record<string, unknown>[] = [];
          for (const lead of leadData ?? []) {
            const name = lead.full_name || lead.email || 'Sin nombre';
            const company = lead.company ? ` de ${lead.company}` : '';
            for (const r of recipients as { user_id: string; send_inapp?: boolean }[]) {
              if (r.send_inapp !== false) {
                notifications.push({
                  recipient_user_id: r.user_id,
                  message: `Nuevo lead B2B: ${name}${company}`,
                  link_url: `/crm?lead=${lead.id}`,
                });
              }
            }
          }
          if (notifications.length > 0) {
            await supabaseAdmin.from('notifications').insert(notifications);
            notifSent = notifications.length;
          }
        }
      } catch (notifErr) {
        // No fallar el sync por errores de notificación; loggear
        console.error('Notification error:', notifErr);
      }
    }

    // ===== Log final =====
    const finalStatus = totalInserted > 0 || totalFetched > 0 ? 'success' : 'success';
    await updateLog({
      status: finalStatus,
      leads_fetched: totalFetched,
      leads_inserted: totalInserted,
      leads_skipped: totalSkipped,
    });

    return new Response(
      JSON.stringify({
        message: 'OK',
        leads_fetched: totalFetched,
        leads_inserted: totalInserted,
        leads_skipped: totalSkipped,
        notifications_sent: notifSent,
        sync_log_id: logId,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const errMsg = (error as Error).message;
    await updateLog({ status: 'error', error_message: errMsg });
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
