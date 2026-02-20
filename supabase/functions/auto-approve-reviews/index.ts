import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    // Protección: verificar CRON_SECRET via header o query param
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), { status: 500 });
    }

    // Aceptar secret en Authorization header o query param ?secret=
    const authHeader = req.headers.get('x-cron-secret') || '';
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret') || '';

    if (authHeader !== cronSecret && querySecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar reviews pendientes que hayan expirado
    const { data: expiredReviews, error: fetchError } = await supabaseAdmin
      .from('content_reviews')
      .select('id, event_id')
      .eq('status', 'pending')
      .lte('expires_at', new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!expiredReviews || expiredReviews.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired reviews', count: 0 }), { status: 200 });
    }

    let approvedCount = 0;

    for (const review of expiredReviews) {
      // Verificar que no haya rechazos explícitos
      const { data: rejections } = await supabaseAdmin
        .from('review_responses')
        .select('id')
        .eq('review_id', review.id)
        .eq('decision', 'rejected')
        .limit(1);

      if (rejections && rejections.length > 0) {
        // Hay rechazos: marcar como rechazado (no auto-aprobar)
        await supabaseAdmin
          .from('content_reviews')
          .update({ status: 'rejected', resolved_at: new Date().toISOString() })
          .eq('id', review.id);

        await supabaseAdmin
          .from('company_events')
          .update({ review_status: 'rejected' })
          .eq('id', review.event_id);
      } else {
        // Sin rechazos: auto-aprobar
        await supabaseAdmin
          .from('content_reviews')
          .update({ status: 'approved', resolved_at: new Date().toISOString() })
          .eq('id', review.id);

        await supabaseAdmin
          .from('company_events')
          .update({ review_status: 'approved' })
          .eq('id', review.event_id);

        approvedCount++;
      }
    }

    return new Response(
      JSON.stringify({ message: 'OK', processed: expiredReviews.length, auto_approved: approvedCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
