import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { escapeHtml } from '../_shared/escapeHtml.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface ReviewNotificationPayload {
  review_id: number;
  event_title: string;
  event_id: number;
  event_description: string;
  event_date: string;
  event_team: string;
  reviewer_ids: string[];
  requester_email: string;
  attachment_url: string;
  media_url: string;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
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
    const { event_title, event_id, event_description, event_date, event_team, reviewer_ids, requester_email, attachment_url, media_url } = payload;

    const previewUrl = attachment_url || media_url;

    for (const reviewerId of reviewer_ids) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(reviewerId);
      const recipientEmail = userData?.user?.email;
      if (!recipientEmail) continue;

      await resend.emails.send({
        from: 'Califica - Contenido <tareas@califica.ai>',
        to: [recipientEmail],
        subject: `🔍 Aprobación requerida: ${event_title}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
            <div style="background: #3c527a; padding: 24px 30px; border-radius: 8px 8px 0 0;">
              <h2 style="color: white; margin: 0; font-size: 20px;">Solicitud de Aprobación</h2>
              <p style="color: #c7d2e0; margin: 6px 0 0; font-size: 13px;">Contenido pendiente de revisión</p>
            </div>
            <div style="padding: 28px 30px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 20px; font-size: 14px;"><strong>${escapeHtml(requester_email)}</strong> necesita tu aprobación para publicar el siguiente contenido:</p>

              <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 0 0 20px;">
                ${previewUrl && isImageUrl(previewUrl) ? `<img src="${escapeHtml(previewUrl)}" alt="Preview" style="width: 100%; max-height: 280px; object-fit: cover; display: block;" />` : ''}
                <div style="padding: 16px;">
                  <h3 style="margin: 0 0 8px; font-size: 17px; color: #1a1a1a;">${escapeHtml(event_title)}</h3>
                  <div style="display: flex; gap: 12px; margin-bottom: 8px;">
                    <span style="font-size: 12px; color: #6b7280;">📅 ${formatDate(event_date)}</span>
                    ${event_team ? `<span style="font-size: 12px; color: #6b7280;">👥 ${escapeHtml(event_team)}</span>` : ''}
                  </div>
                  ${event_description ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">${escapeHtml(event_description).substring(0, 200)}${event_description.length > 200 ? '...' : ''}</p>` : ''}
                  ${previewUrl && !isImageUrl(previewUrl) ? `<p style="margin: 10px 0 0;"><a href="${escapeHtml(previewUrl)}" style="font-size: 12px; color: #3c527a;">🔗 Ver contenido adjunto</a></p>` : ''}
                </div>
              </div>

              <div style="text-align: center; margin: 24px 0 16px;">
                <a href="https://gestor.califica.ai/calendar?event=${event_id}"
                   style="background: #ff8080; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                  Revisar y Aprobar
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 16px 0 0;">Si no respondes a tiempo, el contenido se aprobará automáticamente.</p>
            </div>
          </div>
        `
      });

      await supabaseAdmin.from('notifications').insert({
        recipient_user_id: reviewerId,
        message: `🔍 ${requester_email} solicita tu aprobación para "${event_title}"`,
        link_url: `/calendar?event=${event_id}`,
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
