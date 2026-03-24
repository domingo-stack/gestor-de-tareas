// POST /api/communication/process-template-queue
// Processes the template submission queue: checks active batch status,
// advances to next batch when resolved, submits next batch to Meta.
// Protected by CRON_SECRET (cron) or Supabase auth (manual trigger from UI).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { submitTemplateToMeta, getTemplateStatus } from '@/lib/kapso';

const BATCH_SIZE = 1;
const DELAY_MS = 2000;

const STATUS_MAP: Record<string, string> = {
  APPROVED: 'aprobado',
  REJECTED: 'rechazado',
  PENDING:  'revision',
  PAUSED:   'rechazado',
  DISABLED: 'rechazado',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header
  if (req.headers.get('x-cron-secret') === cronSecret) return true;

  // Check query param
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
  // Auth: accept cron secret OR authenticated user
  const isCron = isAuthorized(req);
  const isUser = !isCron ? await isAuthenticatedUser(req) : false;

  if (!isCron && !isUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // 1. Get all queued templates grouped by batch
  const { data: queued, error: qErr } = await supabase
    .from('comm_templates')
    .select('id, nombre, body, variables, buttons, categoria, estado, kapso_template_id, queue_batch, queue_priority')
    .not('queue_batch', 'is', null)
    .order('queue_batch', { ascending: true })
    .order('queue_priority', { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: 'Error fetching queue', detail: qErr.message }, { status: 500 });
  }

  if (!queued || queued.length === 0) {
    return NextResponse.json({
      active_batch: null,
      message: 'No hay templates en cola',
      submitted: 0,
      checked: 0,
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

  // 2. Find active batch (any in 'revision')
  let activeBatchNum: number | null = null;
  for (const batchNum of sortedBatchNums) {
    const batchTemplates = batches.get(batchNum)!;
    if (batchTemplates.some(t => t.estado === 'revision')) {
      activeBatchNum = batchNum;
      break;
    }
  }

  let checked = 0;
  let submitted = 0;

  // 3. If there's an active batch in revision, check their status with Meta
  if (activeBatchNum !== null) {
    const batchTemplates = batches.get(activeBatchNum)!;
    const inRevision = batchTemplates.filter(t => t.estado === 'revision');

    for (const t of inRevision) {
      if (!t.kapso_template_id) continue;
      try {
        const metaData = await getTemplateStatus(t.kapso_template_id);
        const newEstado = STATUS_MAP[metaData.status] ?? 'revision';

        const updatePayload: Record<string, unknown> = {
          estado: newEstado,
          motivo_rechazo: metaData.rejected_reason ?? null,
          submission_error: null,
          updated_at: new Date().toISOString(),
        };
        if (metaData.category) {
          updatePayload.categoria = metaData.category.toLowerCase();
        }

        await supabase.from('comm_templates').update(updatePayload).eq('id', t.id);
        t.estado = newEstado; // Update local reference
        checked++;
      } catch (err) {
        console.error(`[process-queue] Error checking template ${t.id}:`, err);
      }
    }

    // Check if batch is now fully resolved (all aprobado or rechazado)
    const stillPending = batchTemplates.some(t => t.estado === 'revision' || t.estado === 'borrador');

    if (stillPending) {
      // Batch still processing — return status
      return NextResponse.json({
        active_batch: activeBatchNum,
        status: 'waiting',
        message: `Lote ${activeBatchNum} aún en revisión`,
        checked,
        submitted: 0,
        total_batches: sortedBatchNums.length,
        pending_batches: sortedBatchNums.filter(b => b > activeBatchNum!).length,
      });
    }

    // Batch resolved — clear queue_batch
    const resolvedIds = batchTemplates.map(t => t.id);
    await supabase
      .from('comm_templates')
      .update({ queue_batch: null, queue_priority: null })
      .in('id', resolvedIds);
  }

  // 4. Find next pending batch (all templates in 'borrador')
  let nextBatchNum: number | null = null;
  for (const batchNum of sortedBatchNums) {
    if (batchNum === activeBatchNum) continue; // Skip the one we just resolved
    const batchTemplates = batches.get(batchNum)!;
    if (batchTemplates.some(t => t.estado === 'borrador')) {
      nextBatchNum = batchNum;
      break;
    }
  }

  if (nextBatchNum === null) {
    return NextResponse.json({
      active_batch: null,
      status: 'complete',
      message: 'Cola completada — todos los lotes procesados',
      checked,
      submitted: 0,
    });
  }

  // 5. Submit next batch to Meta
  const nextBatch = batches.get(nextBatchNum)!.filter(t => t.estado === 'borrador');

  for (let i = 0; i < nextBatch.length; i++) {
    const t = nextBatch[i];
    try {
      const result = await submitTemplateToMeta({
        nombre: t.nombre,
        body: t.body,
        variables: t.variables ?? [],
        categoria: (t.categoria as 'utility' | 'marketing') ?? 'utility',
        buttons: t.buttons ?? [],
      });

      await supabase
        .from('comm_templates')
        .update({
          estado: 'revision',
          kapso_template_id: result.id,
          submission_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);

      submitted++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[process-queue] Error submitting template ${t.id}:`, message);

      // Parse Meta error for user-friendly message
      let userError = message;
      try {
        const match = message.match(/\{.*\}/s);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const metaErr = parsed?.error;
          if (metaErr?.error_user_title) {
            userError = `${metaErr.error_user_title}: ${metaErr.error_user_msg}`;
          }
        }
      } catch { /* keep original */ }

      await supabase
        .from('comm_templates')
        .update({
          estado: 'borrador',
          submission_error: userError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
    }

    // Rate limit delay between submissions
    if (i < nextBatch.length - 1) {
      await delay(DELAY_MS);
    }
  }

  // Count remaining batches
  const remainingBatches = sortedBatchNums.filter(b => b > nextBatchNum!).length;

  return NextResponse.json({
    active_batch: nextBatchNum,
    status: 'submitted',
    message: `Lote ${nextBatchNum} enviado a Meta (${submitted} templates)`,
    checked,
    submitted,
    remaining_batches: remainingBatches,
  });
}
