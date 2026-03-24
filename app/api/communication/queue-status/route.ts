// GET /api/communication/queue-status
// Returns the current state of the template submission queue for UI display.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();

  const { data: queued, error } = await supabase
    .from('comm_templates')
    .select('id, nombre, estado, queue_batch, queue_priority')
    .not('queue_batch', 'is', null)
    .order('queue_batch', { ascending: true })
    .order('queue_priority', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!queued || queued.length === 0) {
    return NextResponse.json({
      has_queue: false,
      active_batch: null,
      active_templates: [],
      total_batches: 0,
      completed_batches: 0,
      pending_count: 0,
      total_queued: 0,
    });
  }

  // Group by batch
  const batches = new Map<number, typeof queued>();
  for (const t of queued) {
    const batch = t.queue_batch as number;
    if (!batches.has(batch)) batches.set(batch, []);
    batches.get(batch)!.push(t);
  }

  const sortedBatchNums = [...batches.keys()].sort((a, b) => a - b);

  // Find active batch (has templates in 'revision')
  let activeBatchNum: number | null = null;
  for (const batchNum of sortedBatchNums) {
    const batchTemplates = batches.get(batchNum)!;
    if (batchTemplates.some(t => t.estado === 'revision')) {
      activeBatchNum = batchNum;
      break;
    }
  }

  // Build batch summaries
  const batchSummaries = sortedBatchNums.map(batchNum => {
    const templates = batches.get(batchNum)!;
    return {
      batch: batchNum,
      total: templates.length,
      aprobado: templates.filter(t => t.estado === 'aprobado').length,
      revision: templates.filter(t => t.estado === 'revision').length,
      rechazado: templates.filter(t => t.estado === 'rechazado').length,
      borrador: templates.filter(t => t.estado === 'borrador').length,
      templates: templates.map(t => ({ id: t.id, nombre: t.nombre, estado: t.estado })),
    };
  });

  const activeTemplates = activeBatchNum !== null
    ? (batches.get(activeBatchNum) ?? []).map(t => ({ id: t.id, nombre: t.nombre, estado: t.estado }))
    : [];

  // Count completed (all resolved) vs pending
  const completedBatches = batchSummaries.filter(b => b.borrador === 0 && b.revision === 0).length;
  const pendingCount = queued.filter(t => t.estado === 'borrador').length;

  return NextResponse.json({
    has_queue: true,
    active_batch: activeBatchNum,
    active_templates: activeTemplates,
    total_batches: sortedBatchNums.length,
    completed_batches: completedBatches,
    pending_count: pendingCount,
    total_queued: queued.length,
    batches: batchSummaries,
  });
}
