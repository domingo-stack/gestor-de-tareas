import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { escapeHtml } from '../_shared/escapeHtml.ts';

import { corsHeaders } from '../_shared/cors.ts';

interface TaskPayload {
  record: {
    id: number;
    title: string;
    assignee_user_id: string;
    owner_id: string;
    project_id: number;
    completed: boolean;
  };
  old_record?: {
    assignee_user_id?: string;
    completed?: boolean;
  };
  type: 'INSERT' | 'UPDATE';
  actor_email?: string; // <--- Nuevo campo opcional
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

    const payload: TaskPayload = await req.json();
    const { record, old_record, type, actor_email } = payload;

    // Identificar quién asignó (o quien completa si viene el dato)
    // Si no viene actor_email (caso insert), buscamos al owner
    let assignerEmail = actor_email || "Alguien";
    
    if (!actor_email && record.owner_id) {
        const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(record.owner_id);
        if (ownerData?.user?.email) assignerEmail = ownerData.user.email;
    }

    // --- CASO 1: ASIGNACIÓN (INSERT o cambio de assignee) ---
    const isNewAssignment = type === 'INSERT' || (type === 'UPDATE' && record.assignee_user_id !== old_record?.assignee_user_id);
    
    if (isNewAssignment && record.assignee_user_id) {
        // Obtenemos email del destinatario
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(record.assignee_user_id);
        const recipientEmail = userData?.user?.email;

        // DATOS DEL PROYECTO
        const { data: project } = await supabaseAdmin.from('projects').select('name').eq('id', record.project_id).single();
        const projectName = project?.name || 'General';

        if (recipientEmail) {
            // EVITAR ENVÍO DOBLE: Si me asigno tarea a mí mismo, ¿quiero correo?
            // Si NO quieres correo cuando te asignas a ti mismo, descomenta esto:
            // if (recipientEmail === assignerEmail) {
            //    return new Response(JSON.stringify({ message: "Auto-asignación ignorada" }), { status: 200, headers: corsHeaders });
            // }

            await resend.emails.send({
                from: 'tareas@califica.ai',
                to: [recipientEmail], // Solo al asignado
                subject: `📋 ${escapeHtml(assignerEmail)} te asignó una tarea`,
                html: `
                  <div style="font-family: sans-serif; color: #333;">
                    <h2 style="color: #3c527a;">Nueva Asignación</h2>
                    <p><strong>${escapeHtml(assignerEmail)}</strong> te ha asignado:</p>
                    <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #ff8080; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Tarea:</strong> ${escapeHtml(record.title)}</p>
                        <p style="margin: 5px 0;"><strong>Proyecto:</strong> ${escapeHtml(projectName)}</p>
                    </div>
                    <a href="https://gestor.califica.ai/projects/${record.project_id}?task=${record.id}" style="background:#3c527a; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Ver Tarea</a>
                  </div>
                `
            });
        }
    }

    // --- CASO 2: TAREA COMPLETADA ---
    if (type === 'UPDATE' && record.completed === true && old_record?.completed === false) {
        // Notificamos al DUEÑO de la tarea (owner_id)
        if (record.owner_id) {
            const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(record.owner_id);
            const ownerEmail = ownerUser?.user?.email;

            // No notificar si el dueño es el mismo que la completó (Opcional, pero recomendado)
            if (ownerEmail && ownerEmail !== actor_email) {
                await resend.emails.send({
                    from: 'tareas@califica.ai',
                    to: [ownerEmail],
                    subject: `✅ Tarea completada por ${escapeHtml(assignerEmail)}`,
                    html: `
                      <div style="font-family: sans-serif; color: #333;">
                        <h2 style="color: #166534;">¡Tarea Finalizada!</h2>
                        <p><strong>${escapeHtml(assignerEmail)}</strong> ha marcado como completada la tarea:</p>
                        <p style="font-size: 18px; font-weight: bold;">"${escapeHtml(record.title)}"</p>
                        <a href="https://gestor.califica.ai/projects/${record.project_id}?task=${record.id}" style="color: #3c527a;">Ver tarea</a>
                      </div>
                    `
                });
            }
        }
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