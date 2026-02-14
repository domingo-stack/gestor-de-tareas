// supabase/functions/notify-mentions/index.ts

// 👇 IMPORTACIONES LIMPIAS (Gracias al deno.json)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from 'https://esm.sh/resend';
import { escapeHtml } from '../_shared/escapeHtml.ts';

import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  // 2. MANEJAR LA PETICIÓN "PREFLIGHT" (El navegador pregunta antes de enviar)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error("Falta la variable RESEND_API_KEY");
    const resend = new Resend(resendApiKey);

    const payload = await req.json();
    const { record } = payload; 
    const content = record.content || "";

    // Detección de menciones
    const mentionRegex = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    const matches = content.match(mentionRegex);

    if (!matches || matches.length === 0) {
      // Importante: Devolver headers CORS incluso en respuestas exitosas
      return new Response(JSON.stringify({ message: "No hay menciones." }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Menciones encontradas: ${matches.join(', ')}`);

    // Obtener datos del autor
    const { data: authorUser } = await supabaseAdmin.auth.admin.getUserById(record.user_id);
    const authorEmail = authorUser?.user?.email || "Alguien";

    // Obtener datos de la tarea
    const { data: taskData } = await supabaseAdmin
        .from('tasks')
        .select('title, project_id')
        .eq('id', record.task_id)
        .single();
    
    const taskTitle = taskData?.title || "una tarea";
    const linkUrl = `/projects/${taskData?.project_id}?task=${record.task_id}`;

    // Procesar menciones únicas
    const uniqueEmails: string[] = [...new Set((matches as string[]).map((m: string) => m.substring(1)))];

    for (const email of uniqueEmails) {
        const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
        const users = userData?.users || [];
        const mentionedUser = users.find(u => u.email === email);

        if (mentionedUser && mentionedUser.id !== record.user_id) { 
            await supabaseAdmin.from('notifications').insert({
                recipient_user_id: mentionedUser.id,
                message: `${authorEmail} te mencionó en: "${taskTitle}"`,
                link_url: linkUrl,
                is_read: false
            });

            await resend.emails.send({
                from: 'tareas@califica.ai',
                to: [email], 
                subject: `💬 Te mencionaron en: ${escapeHtml(taskTitle)}`,
                html: `
                  <p><strong>${escapeHtml(authorEmail)}</strong> te mencionó en un comentario:</p>
                  <blockquote style="background: #f9f9f9; border-left: 4px solid #ccc; margin: 1.5em 10px; padding: 0.5em 10px;">
                    "${escapeHtml(content)}"
                  </blockquote>
                  <a href="https://gestor.califica.ai${linkUrl}" style="background:#ff8080; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Ir a la tarea</a>
                `
            });
        }
    }

    return new Response(JSON.stringify({ message: "Menciones procesadas" }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } // También en errores
    });
  }
});