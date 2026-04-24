import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, hasPermission, unauthorized, forbidden, getServiceClient } from '@/lib/api-auth';

const VALID_TEAMS = ['Marketing', 'Producto', 'Customer Success', 'General', 'Kali Te Enseña'];

// ─── POST: Crear evento ───

export async function POST(request: NextRequest) {
  const key = await validateApiKey(request);
  if (!key) return unauthorized();
  if (!hasPermission(key, 'calendar:write')) return forbidden('calendar:write');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { title, start_date, team, description, end_date, video_link, custom_data, notify } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Campo requerido: title (string)' }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'title excede 200 caracteres' }, { status: 400 });
  }
  if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return NextResponse.json({ error: 'Campo requerido: start_date (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!team || typeof team !== 'string') {
    return NextResponse.json({ error: 'Campo requerido: team' }, { status: 400 });
  }
  if (!VALID_TEAMS.includes(team)) {
    return NextResponse.json(
      { error: `Team no válido: "${team}". Opciones: ${VALID_TEAMS.join(', ')}` },
      { status: 422 }
    );
  }

  const supabase = getServiceClient();
  const isDraft = notify === false;

  const { data: event, error } = await supabase
    .from('company_events')
    .insert({
      title: title.trim(),
      start_date,
      end_date: end_date || start_date,
      team,
      description: description || null,
      video_link: video_link || null,
      custom_data: custom_data || null,
      is_draft: isDraft,
      review_status: 'none',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error creando evento', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ event, api_key: key.name }, { status: 201 });
}

// ─── GET: Listar eventos ───

export async function GET(request: NextRequest) {
  const key = await validateApiKey(request);
  if (!key) return unauthorized();
  if (!hasPermission(key, 'calendar:read')) return forbidden('calendar:read');

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const team = searchParams.get('team');
  const limit = parseInt(searchParams.get('limit') || '50');

  const supabase = getServiceClient();

  let query = supabase
    .from('company_events')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(Math.min(limit, 200));

  if (from) query = query.gte('start_date', from);
  if (to) query = query.lte('start_date', to);
  if (team) query = query.eq('team', team);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error listando eventos', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [], total: data?.length || 0 });
}
