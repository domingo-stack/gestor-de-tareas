// POST /api/communication/sync-broadcast
// Fetches broadcast metrics from Kapso and updates local DB.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBroadcastStatus, getBroadcastRecipients } from '@/lib/kapso';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { broadcastId } = await req.json();

  if (!broadcastId) {
    return NextResponse.json({ error: 'broadcastId required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch local broadcast
  const { data: broadcast, error } = await supabase
    .from('comm_broadcasts')
    .select('kapso_broadcast_id')
    .eq('id', broadcastId)
    .single();

  if (error || !broadcast?.kapso_broadcast_id) {
    return NextResponse.json({ error: 'Broadcast not found or missing Kapso ID' }, { status: 404 });
  }

  try {
    const kapso = await getBroadcastStatus(broadcast.kapso_broadcast_id);

    // Map Kapso status to our estados
    const estadoMap: Record<string, string> = {
      draft: 'borrador',
      sending: 'enviando',
      sent: 'completado',
      completed: 'completado',
      failed: 'error',
    };

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (kapso.status) update.estado = estadoMap[kapso.status] ?? kapso.status;
    if (kapso.total_recipients != null) update.total_destinatarios = kapso.total_recipients;
    if (kapso.sent_count != null) update.enviados = kapso.sent_count;
    if (kapso.delivered_count != null) update.entregados = kapso.delivered_count;
    if (kapso.read_count != null) update.leidos = kapso.read_count;

    await supabase
      .from('comm_broadcasts')
      .update(update)
      .eq('id', broadcastId);

    // ── Revenue Attribution ──
    // Get phones directly from Kapso recipients, then match with rev_orders
    let pagosAtribuidos = 0;
    let revenueAtribuido = 0;

    try {
      // Get broadcast created_at for attribution window
      const { data: bcast } = await supabase
        .from('comm_broadcasts')
        .select('created_at')
        .eq('id', broadcastId)
        .single();

      const broadcastDate = bcast?.created_at;
      if (!broadcastDate) throw new Error('No broadcast date');

      // Get attribution window from config (default 3 days)
      const { data: attrConfig } = await supabase
        .from('comm_variables')
        .select('value')
        .eq('key', 'attribution_window_days')
        .single();
      const attributionDays = parseInt(attrConfig?.value ?? '3') || 3;

      // Fetch all recipient phones from Kapso (source of truth)
      const recipientPhones = new Set<string>();
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { recipients, meta } = await getBroadcastRecipients(broadcast.kapso_broadcast_id, page, 100);
        for (const r of recipients) {
          if (r.phone_number) {
            recipientPhones.add(r.phone_number.replace(/\D/g, ''));
          }
        }
        hasMore = page < meta.total_pages;
        page++;
        if (page > 50) break; // safety limit
      }

      if (recipientPhones.size > 0) {
        // Find growth_users emails by phone → match with rev_orders.user_bubble_id (which is actually email)
        // Phones from Kapso are digits only (51945484334), growth_users stores +51945484334
        const phoneArray: string[] = [];
        for (const p of recipientPhones) {
          phoneArray.push(p);
          phoneArray.push(`+${p}`);
        }

        // Get emails from growth_users by phone
        const allEmails = new Set<string>();
        for (let i = 0; i < phoneArray.length; i += 500) {
          const batch = phoneArray.slice(i, i + 500);
          const { data: matchedUsers } = await supabase
            .from('growth_users')
            .select('email')
            .in('phone', batch)
            .not('email', 'is', null);
          if (matchedUsers) {
            for (const u of matchedUsers) allEmails.add(u.email.toLowerCase());
          }
        }

        if (allEmails.size > 0) {
          const ATTRIBUTION_WINDOW_MS = attributionDays * 24 * 60 * 60 * 1000;
          const broadcastTime = new Date(broadcastDate).getTime();
          const emails = [...allEmails];

          // Match with rev_orders.user_bubble_id (which contains emails)
          const seen = new Set<string>();
          for (let i = 0; i < emails.length; i += 500) {
            const batch = emails.slice(i, i + 500);
            const { data: orders } = await supabase
              .from('rev_orders')
              .select('id, user_bubble_id, amount_usd, created_at')
              .in('user_bubble_id', batch)
              .gte('created_at', broadcastDate);

            if (orders) {
              for (const order of orders) {
                const orderTime = new Date(order.created_at).getTime();
                if (orderTime >= broadcastTime && orderTime <= broadcastTime + ATTRIBUTION_WINDOW_MS && !seen.has(order.id)) {
                  seen.add(order.id);
                  pagosAtribuidos++;
                  revenueAtribuido += Number(order.amount_usd) || 0;
                }
              }
            }
          }
        }
      }

      // Update attribution columns
      await supabase
        .from('comm_broadcasts')
        .update({
          pagos_atribuidos: pagosAtribuidos,
          revenue_atribuido: revenueAtribuido,
        })
        .eq('id', broadcastId);
    } catch (attrErr) {
      console.error('[sync-broadcast] revenue attribution error:', attrErr);
      // Don't fail the sync if attribution fails
    }

    return NextResponse.json({ ok: true, kapso, update, attribution: { pagosAtribuidos, revenueAtribuido } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
