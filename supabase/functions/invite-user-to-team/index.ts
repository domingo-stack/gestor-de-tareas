// supabase/functions/invite-user-to-team/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { emailToInvite } = await req.json();
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
      }
    );

    if (inviteError) throw inviteError;

    // Asignar rol según dominio del email
    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('domain')
      .eq('id', 1)
      .single();

    const domain = emailToInvite.split('@')[1];
    const newRole = domain === orgSettings?.domain ? 'member' : 'invitado';

    // Buscar si el usuario ya existe para asignarle rol
    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = userData?.users?.find(u => u.email === emailToInvite);

    if (existingUser) {
      await supabaseAdmin
        .from('profiles')
        .update({ role: newRole })
        .eq('id', existingUser.id);

      // Crear permisos default
      await supabaseAdmin
        .from('user_permissions')
        .upsert({
          user_id: existingUser.id,
          mod_tareas: true,
          mod_calendario: newRole === 'member',
          mod_revenue: false,
          mod_finanzas: false
        });
    }

    return new Response(JSON.stringify({ message: `Invitación enviada a ${emailToInvite}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    try {
      console.error('!!! ERROR CAPTURADO EN LA FUNCIÓN (full):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    } catch (e) {
      console.error('!!! ERROR CAPTURADO EN LA FUNCIÓN (non-serializable):', error);
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
