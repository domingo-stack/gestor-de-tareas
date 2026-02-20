import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { escapeHtml } from '../_shared/escapeHtml.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface ApprovalPayload {
  event_title: string;
  event_id: number;
  event_description: string;
  event_date: string;
  event_team: string;
  requester_email: string;
  reviewer_email: string;
  all_approved: boolean;
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

    const payload: ApprovalPayload = await req.json();
    const { event_title, event_id, event_description, event_date, event_team, requester_email, reviewer_email, all_approved, media_url } = payload;

    const headerBg = all_approved ? '#16a34a' : '#3c527a';
    const headerTitle = all_approved ? 'Contenido Aprobado' : 'Aprobación Registrada';
    const headerSub = all_approved
      ? 'Todos los revisores han dado su visto bueno'
      : `${reviewer_email} aprobó tu contenido`;

    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const requester = users?.users?.find(u => u.email === requester_email);

    await resend.emails.send({
      from: 'Califica - Contenido <tareas@califica.ai>',
      to: [requester_email],
      subject: all_approved ? `✅ Contenido aprobado: ${event_title}` : `👍 ${reviewer_email} aprobó tu contenido`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background: ${headerBg}; padding: 24px 30px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 20px;">${headerTitle}</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 13px;">${escapeHtml(headerSub)}</p>
          </div>
          <div style="padding: 28px 30px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            ${all_approved ? '<div style="text-align: center; margin: 0 0 20px;"><span style="font-size: 48px;">✅</span></div>' : ''}

            <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 0 0 20px;">
              ${media_url && isImageUrl(media_url) ? `<img src="${escapeHtml(media_url)}" alt="Preview" style="width: 100%; max-height: 280px; object-fit: cover; display: block;" />` : ''}
              <div style="padding: 16px;">
                <h3 style="margin: 0 0 8px; font-size: 17px; color: #1a1a1a;">${escapeHtml(event_title)}</h3>
                <div style="margin-bottom: 8px;">
                  <span style="font-size: 12px; color: #6b7280;">📅 ${formatDate(event_date)}</span>
                  ${event_team ? `<span style="font-size: 12px; color: #6b7280; margin-left: 12px;">👥 ${escapeHtml(event_team)}</span>` : ''}
                </div>
                ${event_description ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">${escapeHtml(event_description).substring(0, 200)}${event_description.length > 200 ? '...' : ''}</p>` : ''}
              </div>
            </div>

            ${!all_approved ? `<p style="font-size: 13px; color: #6b7280; margin: 0 0 16px;">Aún faltan revisores por responder. Te notificaremos cuando se complete la revisión.</p>` : ''}

            <div style="text-align: center; margin: 24px 0 16px;">
              <a href="https://gestor.califica.ai/calendar?event=${event_id}"
                 style="background: #ff8080; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                Ver Evento
              </a>
            </div>
          </div>
        </div>
      `
    });

    if (requester) {
      const message = all_approved
        ? `✅ Tu contenido "${event_title}" fue aprobado por todos los revisores`
        : `👍 ${reviewer_email} aprobó tu contenido "${event_title}"`;

      await supabaseAdmin.from('notifications').insert({
        recipient_user_id: requester.id,
        message,
        link_url: `/calendar?event=${event_id}`,
      });
    }

    return new Response(JSON.stringify({ message: "OK" }), {
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
