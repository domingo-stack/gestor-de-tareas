import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVENTS_API_SECRET = process.env.EVENTS_API_SECRET;

const VALID_TEAMS = ['Marketing', 'Producto', 'Customer Success', 'General', 'Kali Te Enseña'];

function authenticate(request: NextRequest): boolean {
  if (!EVENTS_API_SECRET) return false;
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '').trim();
  return token === EVENTS_API_SECRET;
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─── POST: Crear evento ───

export async function POST(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { title, start_date, team, description, end_date, video_link, custom_data, notify } = body;

  // Validar requeridos
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

  // Si notify === false, crear como draft para no disparar notificaciones
  const isDraft = notify === false;

  const insertData: Record<string, unknown> = {
    title: title.trim(),
    start_date,
    end_date: end_date || start_date,
    team,
    description: description || null,
    video_link: video_link || null,
    custom_data: custom_data || null,
    is_draft: isDraft,
    review_status: 'none',
  };

  const { data: event, error } = await supabase
    .from('company_events')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Error creando evento', details: error.message }, { status: 500 });
  }

  // Contar notificaciones enviadas (el trigger de Supabase las crea automáticamente)
  let notificationsSent = 0;
  if (!isDraft) {
    // Esperar un momento para que el trigger procese
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 5000).toISOString())
      .like('message', `%${title.slice(0, 30)}%`);
    notificationsSent = count || 0;
  }

  return NextResponse.json({
    event,
    notifications_sent: notificationsSent,
  }, { status: 201 });
}

// ─── GET: Listar eventos ───

export async function GET(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  return NextResponse.json({
    events: data || [],
    total: data?.length || 0,
  });
}
