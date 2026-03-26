// POST /api/communication/process-drip
// Cron-triggered processor for drip campaign steps.
// Checks active drip campaigns, finds steps ready to send, creates broadcasts.
// Protected by CRON_SECRET or authenticated user.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  if (req.headers.get('x-cron-secret') === cronSecret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === cronSecret) return true;
  return false;
}

async function isAuthenticatedUser(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase.auth.getUser(token);
  return !!data?.user;
}

export async function POST(req: NextRequest) {
  const isCron = isAuthorized(req);
  const isUser = !isCron ? await isAuthenticatedUser(req) : false;
  if (!isCron && !isUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  let processed = 0;
  let skipped = 0;

  // Find active drip campaigns
  const { data: activeDrips } = await supabase
    .from('comm_drip_campaigns')
    .select('id, nombre, segmento_filtros, created_at')
    .eq('estado', 'activa');

  if (!activeDrips || activeDrips.length === 0) {
    return NextResponse.json({ message: 'No hay secuencias activas', processed: 0 });
  }

  const now = new Date();

  for (const drip of activeDrips) {
    // Get all steps ordered
    const { data: steps } = await supabase
      .from('comm_drip_steps')
      .select('*')
      .eq('drip_campaign_id', drip.id)
      .order('step_order', { ascending: true });

    if (!steps || steps.length === 0) continue;

    // Find the next pending step
    const nextStep = steps.find(s => s.estado === 'pendiente');
    if (!nextStep) {
      // All steps completed — mark drip as completada
      await supabase
        .from('comm_drip_campaigns')
        .update({ estado: 'completada', updated_at: now.toISOString() })
        .eq('id', drip.id);
      continue;
    }

    // Calculate when this step should be sent
    // Step 1 (order=1): send immediately when activated (delay_days=0)
    // Step N: send after cumulative delay from drip created_at
    let cumulativeDelayMs = 0;
    for (const s of steps) {
      if (s.step_order >= nextStep.step_order) break;
      cumulativeDelayMs += (s.delay_days * 24 + s.delay_hours) * 60 * 60 * 1000;
    }
    // Add this step's own delay
    cumulativeDelayMs += (nextStep.delay_days * 24 + nextStep.delay_hours) * 60 * 60 * 1000;

    const dripCreatedAt = new Date(drip.created_at).getTime();
    const scheduledTime = dripCreatedAt + cumulativeDelayMs;

    // Check if current hour matches send_at_hour (UTC-5)
    const nowUTC5 = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const currentHourUTC5 = nowUTC5.getUTCHours();

    // Only send if: scheduled time has passed AND current hour matches send_at_hour
    if (now.getTime() < scheduledTime) {
      skipped++;
      continue;
    }

    // Allow 2-hour window for send_at_hour (in case cron runs at :15 or :45)
    if (Math.abs(currentHourUTC5 - nextStep.send_at_hour) > 2) {
      skipped++;
      continue;
    }

    // ── Ready to send this step ──
    try {
      // Get template
      const { data: template } = await supabase
        .from('comm_templates')
        .select('id, nombre, kapso_template_id, estado')
        .eq('id', nextStep.template_id)
        .single();

      if (!template || template.estado !== 'aprobado' || !template.kapso_template_id) {
        console.error(`[process-drip] Template ${nextStep.template_id} not approved, skipping step`);
        skipped++;
        continue;
      }

      // Create a broadcast for this step (reuse the existing broadcast infrastructure)
      const { data: broadcast, error: bError } = await supabase
        .from('comm_broadcasts')
        .insert({
          nombre: `${drip.nombre} — Paso ${nextStep.step_order}`,
          template_id: nextStep.template_id,
          segmento_filtros: drip.segmento_filtros || {},
          estado: 'borrador',
          total_destinatarios: 0,
          enviados: 0,
          entregados: 0,
          leidos: 0,
          clickeados: 0,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (bError || !broadcast) {
        console.error(`[process-drip] Error creating broadcast for step ${nextStep.id}:`, bError);
        continue;
      }

      // Trigger the send-broadcast API (internal call)
      const sendRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(req.url).origin : 'http://localhost:3000'}/api/communication/send-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: broadcast.id }),
      });

      if (sendRes.ok) {
        // Mark step as enviado
        await supabase
          .from('comm_drip_steps')
          .update({ estado: 'enviado', broadcast_id: broadcast.id })
          .eq('id', nextStep.id);
        processed++;
      } else {
        const err = await sendRes.json();
        console.error(`[process-drip] send-broadcast failed for step ${nextStep.id}:`, err);
      }
    } catch (err) {
      console.error(`[process-drip] Error processing step ${nextStep.id}:`, err);
    }
  }

  return NextResponse.json({
    message: `Procesadas ${processed} secuencia(s), ${skipped} omitida(s)`,
    processed,
    skipped,
    total_active: activeDrips.length,
  });
}
