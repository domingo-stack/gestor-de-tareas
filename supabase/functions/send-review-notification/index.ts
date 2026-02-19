import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { escapeHtml } from '../_shared/escapeHtml.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface ReviewNotificationPayload {
  review_id: number;
  event_title: string;
  event_id: number;
  reviewer_ids: string[];
  requester_email: string;
  attachment_url: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error("Falta RESEND_API_KEY");
    const resend = new Resend(resendApiKey);

    const payload: ReviewNotificationPayload = await req.json();
    const { review_id, event_title, event_id, reviewer_ids, requester_email, attachment_url } = payload;

    // Enviar correo a cada reviewer
    for (const reviewerId of reviewer_ids) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(reviewerId);
      const recipientEmail = userData?.user?.email;

      if (!recipientEmail) continue;

      // Enviar correo
      await resend.emails.send({
        from: 'contenido@califica.ai',
        to: [recipientEmail],
        subject: `🔍 ${escapeHtml(requester_email)} solicita tu aprobación de contenido`,
        html: `
          <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
            <div style="background: #3c527a; padding: 20px 30px; border-radius: 8px 8px 0 0;">
              <h2 style="color: white; margin: 0;">Solicitud de Aprobación</h2>
            </div>
            <div style="padding: 25px 30px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">
              <p><strong>${escapeHtml(requester_email)}</strong> necesita tu aprobación para el contenido del evento:</p>
              <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #ca8a04; margin: 20px 0; border-radius: 0 4px 4px 0;">
                <p style="margin: 5px 0; font-size: 16px;"><strong>${escapeHtml(event_title)}</strong></p>
              </div>
              ${attachment_url ? `<p style="margin: 10px 0; color: #6b7280; font-size: 13px;">Contenido adjunto disponible en el evento.</p>` : ''}
              <div style="text-align: center; margin: 25px 0;">
                <a href="https://gestor.califica.ai/calendar?event=${event_id}"
                   style="background: #ff8080; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Revisar Contenido
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Si no respondes a tiempo, el contenido se aprobará automáticamente.</p>
            </div>
          </div>
        `
      });

      // Insertar notificación in-app
      await supabaseAdmin.from('notifications').insert({
        recipient_user_id: reviewerId,
        type: 'review_request',
        title: 'Solicitud de aprobación',
        body: `${requester_email} solicita tu aprobación para "${event_title}"`,
        link: `/calendar?event=${event_id}`,
      });
    }

    return new Response(JSON.stringify({ message: "OK", notified: reviewer_ids.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
