// supabase/functions/invite-user-to-team/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { emailToInvite, team_id } = await req.json();
    if (!team_id) throw new Error("El ID del equipo (team_id) es requerido.");
    if (!emailToInvite) throw new Error("El email a invitar es requerido.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const redirectTo = Deno.env.get('SITE_URL');
    if (!redirectTo) throw new Error("La configuración del servidor es incorrecta (falta SITE_URL).");

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      emailToInvite,
      {
        redirectTo: `${redirectTo}/accept-invite`,
        data: { team_id: team_id } 
      }
    );

    if (inviteError) throw inviteError;

    return new Response(JSON.stringify({ message: `Invitación enviada a ${emailToInvite}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // ---- ESTE ES EL BLOQUE MEJORADO ----
    // Intenta registrar el error completo de forma segura
    try { 
      console.error('!!! ERROR CAPTURADO EN LA FUNCIÓN (full):', JSON.stringify(error, Object.getOwnPropertyNames(error))); 
    } catch (e) { 
      console.error('!!! ERROR CAPTURADO EN LA FUNCIÓN (non-serializable):', error); 
    }
    
    // Devolvemos una respuesta de error al cliente
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
    // ---- FIN DEL BLOQUE MEJORADO ----
  }
});