import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend';
import { escapeHtml } from '../_shared/escapeHtml.ts';

serve(async (req: Request) => {
  const executionId = req.headers.get('x-supabase-edge-execution-id');
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const logError = async (message: string, stack: string | null = null) => {
    await supabaseAdmin.from('function_logs').insert({
      function_name: 'send-event-notification',
      level: 'error',
      execution_id: executionId,
      message: message,
      context: { stack: stack }
    });
  };

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Faltan variables de entorno.");
    }

    const resend = new Resend(resendApiKey);

    const payload = await req.json();
    const newEvent = payload.record;

    // Obtener nombre del creador del evento
    const { data: creatorData } = await supabaseAdmin.auth.admin.getUserById(newEvent.user_id);
    const creatorIdentifier = creatorData?.user?.email || 'Alguien';

    // Obtener destinatarios filtrados por preferencias y permisos
    const { data: recipients, error: recipientsError } = await supabaseAdmin.rpc('get_notification_recipients', {
      p_notification_type: 'event_created'
    });

    if (recipientsError) {
      throw new Error(`Error al obtener destinatarios: ${recipientsError.message}`);
    }

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ message: "No hay destinatarios para notificar." }), { status: 200 });
    }

    // Filtrar al creador del evento
    const filteredRecipients = recipients.filter((r: any) => r.user_id !== newEvent.user_id);

    if (filteredRecipients.length === 0) {
      return new Response(JSON.stringify({ message: "No hay destinatarios (excluido el creador)." }), { status: 200 });
    }

    const subject = `${escapeHtml(creatorIdentifier)} creó un nuevo evento: ${escapeHtml(newEvent.title)}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .header { background-color: #3c527a; color: #ffffff; padding: 20px; text-align: center; }
          .content { padding: 30px; color: #333; }
          .content h1 { font-size: 20px; color: #383838; }
          .content p { line-height: 1.6; }
          .item { margin-bottom: 10px; }
          .item strong { color: #3c527a; }
          .button { display: inline-block; padding: 12px 24px; margin-top: 20px; background-color: #ff8080; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; }
          .footer { background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Nuevo Evento en el Calendario</h2>
          </div>
          <div class="content">
            <h1>${escapeHtml(creatorIdentifier)} ha creado un nuevo evento:</h1>
            <p class="item"><strong>Evento:</strong> ${escapeHtml(newEvent.title)}</p>
            <p class="item"><strong>Equipo:</strong> ${escapeHtml(newEvent.team || '')}</p>
            <p class="item"><strong>Descripción:</strong> ${escapeHtml(newEvent.description || '')}</p>
            <p class="item"><strong>Fecha:</strong> ${new Date(newEvent.start_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <a href="https://gestor.califica.ai/calendar" class="button">Ver en el Calendario</a>
          </div>
          <div class="footer">
            <p>Gestor de Tareas de Califica.ai</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Enviar emails individuales solo a quienes tienen send_email = true
    const emailRecipients = filteredRecipients.filter((r: any) => r.send_email && r.email);
    for (const recipient of emailRecipients) {
      await resend.emails.send({
        from: 'tareas@califica.ai',
        to: [recipient.email],
        subject: subject,
        html: emailHtml,
      });
    }

    // Notificaciones in-app solo a quienes tienen send_inapp = true
    const inappRecipients = filteredRecipients.filter((r: any) => r.send_inapp);
    if (inappRecipients.length > 0) {
      const notificationsToInsert = inappRecipients.map((r: any) => ({
        recipient_user_id: r.user_id,
        message: `Nuevo evento de ${newEvent.team}: ${newEvent.title}`,
        link_url: '/calendar',
      }));

      const { error: notificationError } = await supabaseAdmin.from('notifications').insert(notificationsToInsert);
      if (notificationError) {
        throw new Error(`Error al crear notificaciones in-app: ${notificationError.message}`);
      }
    }

    return new Response(JSON.stringify({ message: "OK", emailed: emailRecipients.length, inapp: inappRecipients.length }), { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido';
    await logError(errorMessage, error instanceof Error ? error.stack : null);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});
