// POST /api/communication/send-scheduled
// Cron-invoked endpoint: finds broadcasts with estado='programado' and scheduled_at <= now,
// then triggers send-broadcast for each one.
// Protected with CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret =
    req.headers.get('x-cron-secret') ??
    new URL(req.url).searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  // Find all scheduled broadcasts that are due (exclude sequences — those are handled by process-drip)
  const { data: due, error } = await supabase
    .from('comm_broadcasts')
    .select('id')
    .eq('estado', 'programado')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .or('is_sequence.is.null,is_sequence.eq.false');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No scheduled broadcasts due' });
  }

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];

  for (const broadcast of due) {
    try {
      // Use internal fetch to send-broadcast endpoint
      const origin = req.headers.get('host')?.includes('localhost')
        ? `http://${req.headers.get('host')}`
        : `https://${req.headers.get('host')}`;

      const res = await fetch(`${origin}/api/communication/send-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: broadcast.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        results.push({ id: broadcast.id, ok: false, error: err.error });
      } else {
        results.push({ id: broadcast.id, ok: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: broadcast.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
}
