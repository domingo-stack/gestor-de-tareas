// POST /api/communication/process-drip
// Cron-triggered processor for drip campaign steps.
// Checks active drip campaigns, finds steps ready to send, creates broadcasts.
// Protected by CRON_SECRET or authenticated user.
//
// SAFETY: Idempotent — will NOT re-send a step that already has a broadcast_id.

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
  const details: string[] = [];

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

    // Find the next pending step that does NOT already have a broadcast_id
    const nextStep = steps.find(s => s.estado === 'pendiente' && !s.broadcast_id);
    if (!nextStep) {
      // Check if all steps are done
      const allDone = steps.every(s => s.estado === 'enviado' || s.estado === 'cancelado');
      if (allDone) {
        await supabase
          .from('comm_drip_campaigns')
          .update({ estado: 'completada', updated_at: now.toISOString() })
          .eq('id', drip.id);
        details.push(`${drip.nombre}: completada (todos los pasos enviados)`);
      } else {
        details.push(`${drip.nombre}: sin pasos pendientes por enviar`);
      }
      continue;
    }

    // ── Check if this step is ready to send ──
    // Use send_date + send_at_hour from the step
    // The step stores: delay_days (relative), send_at_hour (hour UTC-5)
    // But the UI now uses send_date + send_time — we need to check both approaches

    // Approach 1: If step has a known scheduled time from the drip creation
    // Calculate absolute time: drip.created_at + cumulative delays
    let cumulativeDelayMs = 0;
    for (const s of steps) {
      if (s.step_order >= nextStep.step_order) break;
      cumulativeDelayMs += (s.delay_days * 24 + (s.delay_hours || 0)) * 60 * 60 * 1000;
    }
    cumulativeDelayMs += (nextStep.delay_days * 24 + (nextStep.delay_hours || 0)) * 60 * 60 * 1000;

    const dripCreatedAt = new Date(drip.created_at).getTime();
    const scheduledTime = dripCreatedAt + cumulativeDelayMs;

    // Also check send_at_hour window (UTC-5)
    const nowUTC5 = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const currentHourUTC5 = nowUTC5.getUTCHours();

    // Not ready yet (scheduled time hasn't passed)
    if (now.getTime() < scheduledTime) {
      skipped++;
      details.push(`${drip.nombre} paso ${nextStep.step_order}: no es tiempo aún`);
      continue;
    }

    // Check hour window (allow 3-hour window)
    if (Math.abs(currentHourUTC5 - nextStep.send_at_hour) > 3 && currentHourUTC5 !== nextStep.send_at_hour) {
      skipped++;
      details.push(`${drip.nombre} paso ${nextStep.step_order}: fuera de ventana horaria (actual: ${currentHourUTC5}, esperado: ${nextStep.send_at_hour})`);
      continue;
    }

    // ── SAFETY: Double-check this step hasn't been sent already ──
    // Re-read the step from DB to avoid race conditions
    const { data: freshStep } = await supabase
      .from('comm_drip_steps')
      .select('estado, broadcast_id')
      .eq('id', nextStep.id)
      .single();

    if (freshStep?.estado !== 'pendiente' || freshStep?.broadcast_id) {
      details.push(`${drip.nombre} paso ${nextStep.step_order}: ya procesado (race condition evitada)`);
      continue;
    }

    // ── Mark step as "sending" BEFORE creating broadcast (prevent duplicates) ──
    const { error: lockError } = await supabase
      .from('comm_drip_steps')
      .update({ estado: 'enviando' })
      .eq('id', nextStep.id)
      .eq('estado', 'pendiente'); // Only update if still pending (optimistic lock)

    if (lockError) {
      details.push(`${drip.nombre} paso ${nextStep.step_order}: error al bloquear step`);
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
        await supabase.from('comm_drip_steps').update({ estado: 'cancelado' }).eq('id', nextStep.id);
        details.push(`${drip.nombre} paso ${nextStep.step_order}: template no aprobado, cancelado`);
        skipped++;
        continue;
      }

      // Create a broadcast for this step
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
          is_sequence: false, // Child broadcast, not the parent
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (bError || !broadcast) {
        console.error(`[process-drip] Error creating broadcast for step ${nextStep.id}:`, bError);
        await supabase.from('comm_drip_steps').update({ estado: 'pendiente' }).eq('id', nextStep.id);
        continue;
      }

      // Mark step with broadcast_id BEFORE sending (so next cron won't pick it up)
      await supabase
        .from('comm_drip_steps')
        .update({ estado: 'enviado', broadcast_id: broadcast.id })
        .eq('id', nextStep.id);

      // Trigger the send
      const origin = req.headers.get('host')?.includes('localhost')
        ? `http://${req.headers.get('host')}`
        : `https://${req.headers.get('host')}`;

      const sendRes = await fetch(`${origin}/api/communication/send-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: broadcast.id }),
      });

      if (sendRes.ok) {
        processed++;
        details.push(`${drip.nombre} paso ${nextStep.step_order}: enviado OK (broadcast ${broadcast.id})`);
      } else {
        const err = await sendRes.json();
        console.error(`[process-drip] send-broadcast failed for step ${nextStep.id}:`, err);
        details.push(`${drip.nombre} paso ${nextStep.step_order}: error al enviar: ${err.error}`);
      }
    } catch (err) {
      console.error(`[process-drip] Error processing step ${nextStep.id}:`, err);
      // Revert step to pending on error
      await supabase.from('comm_drip_steps').update({ estado: 'pendiente', broadcast_id: null }).eq('id', nextStep.id);
      details.push(`${drip.nombre} paso ${nextStep.step_order}: error de ejecución`);
    }
  }

  return NextResponse.json({
    message: `Procesadas ${processed} secuencia(s), ${skipped} omitida(s)`,
    processed,
    skipped,
    total_active: activeDrips.length,
    details,
  });
}
