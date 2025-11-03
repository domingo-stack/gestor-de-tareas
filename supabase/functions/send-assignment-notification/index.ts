import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Interfaz para entender los datos que nos enviará el Trigger
interface TaskPayload {
  record: {
    id: number;
    title: string;
    assignee_user_id: string;
    project_id: number;
  };
  old_record?: { // old_record solo existe en un UPDATE
    assignee_user_id?: string;
  };
  type: 'INSERT' | 'UPDATE';
}

serve(async (req: Request) => {

  console.log("¡Función de correo INICIADA!");
  const executionId = req.headers.get('x-supabase-edge-execution-id');
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const logError = async (message: string, stack: string | null = null) => { /* ... (tu función logError se queda igual) ... */ };

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error("Falta RESEND_API_KEY.");
    const resend = new Resend(resendApiKey);

    const payload: TaskPayload = await req.json();
    const newTask = payload.record;
    console.log("Payload recibido para tarea ID:", newTask.id);
    
    // Si no hay un usuario asignado, no hacemos nada.
    if (!newTask.assignee_user_id) {
      console.log("No hay asignado, saliendo.");
      return new Response(JSON.stringify({ message: "No hay usuario asignado, no se notifica." }), { status: 200 });
    }
    console.log(`Buscando email para usuario: ${newTask.assignee_user_id}`);

    // 1. Buscamos el correo del usuario asignado
    const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById(newTask.assignee_user_id);
    if (userError) throw new Error(`Error al buscar usuario: ${userError.message}`);
    if (!user?.user?.email) throw new Error("Usuario no encontrado o no tiene email.");

    const recipientEmail = user.user.email;
    console.log(`Email encontrado: ${recipientEmail}. Buscando proyecto...`);
    const creatorEmail = "tareas@califica.ai"; // Puedes cambiar esto si quieres

    // 2. Buscamos el nombre del proyecto
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', newTask.project_id)
      .single();
    if (projectError) throw new Error(`Error al buscar proyecto: ${projectError.message}`);
    
    const projectName = project?.name || 'un proyecto';
    console.log(`Proyecto encontrado: ${projectName}. Enviando correo...`);
    const taskLink = `https://gestor.califica.ai/projects/${newTask.project_id}?task=${newTask.id}`; // Enlace directo a la tarea

    // 3. Enviamos el correo
    await resend.emails.send({
      from: 'tareas@califica.ai',
      to: recipientEmail,
      subject: `¡Nueva tarea asignada!: ${newTask.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            .header { background-color: #3c527a; color: #ffffff; padding: 20px; text-align: center; }
            .content { padding: 30px; color: #333; }
            .content h1 { font-size: 20px; color: #383838; }
            .content p { line-height: 1.6; }
            .item { margin-bottom: 10px; }
            .item strong { color: #3c527a; }
            .button { display: inline-block; padding: 12px 24px; margin-top: 20px; background-color: #ff8080; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>¡Te han asignado una nueva tarea!</h2>
            </div>
            <div class="content">
              <h1>Hola,</h1>
              <p>Se te ha asignado la siguiente tarea:</p>
              <p class="item"><strong>Tarea:</strong> ${newTask.title}</p>
              <p class="item"><strong>Proyecto:</strong> ${projectName}</p>
              <p class="item"><strong>Descripción:</strong> ${
                (typeof (newTask as any).description === 'string' && (newTask as any).description.trim().length > 0)
                  ? (newTask as any).description
                  : 'Sin descripción'
              }</p>
              <a href="${taskLink}" class="button">Ver Tarea en el Gestor</a>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    console.log("¡Correo enviado con éxito a Resend!");

    // 4. (Opcional) Creamos la notificación en la app también
    await supabaseAdmin.from('notifications').insert({
      recipient_user_id: newTask.assignee_user_id,
      message: `Te asignaron la tarea: "${newTask.title}" en el proyecto ${projectName}`,
      link_url: taskLink,
    });

    return new Response(JSON.stringify({ message: "OK" }), { status: 200 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido';
    await logError(errorMessage, error instanceof Error ? error.stack : null);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});