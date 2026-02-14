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
    // --- Configuración (se mantiene igual) ---
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!resendApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Faltan variables de entorno.");
    }

    const resend = new Resend(resendApiKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const newEvent = payload.record;

    // --- PASO 1: OBTENER DATOS ADICIONALES ---

    // Buscamos el nombre del usuario que creó el evento
    const { data: { users: allUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
if (usersError) {
  throw new Error(`Error al buscar usuarios: ${usersError.message}`);
}
if (!allUsers || allUsers.length === 0) {
  return new Response(JSON.stringify({ message: "No se encontraron usuarios para notificar." }));
}

// Ahora, de esa lista, encontramos al creador del evento.
const creator = allUsers.find(user => user.id === newEvent.user_id);
// Usamos su email como identificador. Si no lo encontramos, usamos un texto genérico.
const creatorIdentifier = creator?.email || 'Alguien';

// La lista de correos para enviar la notificación se queda igual.
const recipientEmails = allUsers.map(user => user.email).filter((email): email is string => !!email);
if (recipientEmails.length === 0) {
  return new Response(JSON.stringify({ message: "No se encontraron correos válidos." }));
}

    // --- PASO 2: USAR LA NUEVA PLANTILLA HTML ---

    const subject = `${escapeHtml(creatorIdentifier)} creó un nuevo evento: ${escapeHtml(newEvent.title)}`;

    await resend.emails.send({
      from: 'tareas@califica.ai',
      to: recipientEmails,
      subject: subject,
      html: `
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
      `,
    });

    const notificationsToInsert = allUsers.map(user => ({
        recipient_user_id: user.id,
        message: `Nuevo evento de ${newEvent.team}: ${newEvent.title}`,
        link_url: '/calendar',
    }));

    const { error: notificationError } = await supabaseAdmin.from('notifications').insert(notificationsToInsert);

    // Si hay un error al insertar la notificación, lo lanzamos para que el catch lo registre.
    if (notificationError) {
        throw new Error(`Error al crear la notificación en la app: ${notificationError.message}`);
    }

    return new Response(JSON.stringify({ message: "OK" }), { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido';
    await logError(errorMessage, error instanceof Error ? error.stack : null);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});