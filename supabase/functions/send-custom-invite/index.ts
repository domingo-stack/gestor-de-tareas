// supabase/functions/send-custom-invite/index.ts

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { escapeHtml } from '../_shared/escapeHtml.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { emailToInvite, team_id } = await req.json();
    if (!team_id || !emailToInvite) throw new Error("Faltan datos.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Crear una nueva fila en nuestra tabla de invitaciones
    const { data: invitation, error: insertError } = await supabaseAdmin
      .from('invitations')
      .insert({ email: emailToInvite, team_id: team_id })
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Construir el enlace de registro usando nuestro token único
    const SITE_URL = Deno.env.get('SITE_URL');
    const registrationLink = `${SITE_URL}/register?invite_token=${invitation.token}`;

    // 3. Enviar el email usando la API de Resend directamente
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Kali - Tareas <tareas@califica.ai>', // O tu email verificado en Resend
        to: [emailToInvite],
        subject: 'Invitación a unirte a un equipo',
        html: `<h1>¡Has sido invitado!</h1><p>Para unirte al equipo, por favor regístrate en el siguiente enlace:</p><a href="${escapeHtml(registrationLink)}">Aceptar Invitación</a>`,
      }),
    });

    if (!resendResponse.ok) {
        const errorBody = await resendResponse.json();
        throw new Error(`Error al enviar el email: ${JSON.stringify(errorBody)}`);
    }

    return new Response(JSON.stringify({ message: `Invitación personalizada enviada a ${emailToInvite}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("!!! ERROR EN CUSTOM INVITE:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});