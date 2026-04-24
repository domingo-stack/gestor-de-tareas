import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, hasPermission, unauthorized, forbidden, getServiceClient } from '@/lib/api-auth';

const VALID_CATEGORIES = ['producto', 'customer_success', 'marketing', 'otro'];

// Map legacy types to new categories
function normalizeCategory(type: string): string {
  if (['feature', 'tech_debt', 'bug'].includes(type)) return 'producto';
  if (VALID_CATEGORIES.includes(type)) return type;
  return 'otro';
}

// ─── GET: Listar tareas ───

export async function GET(request: NextRequest) {
  const key = await validateApiKey(request);
  if (!key) return unauthorized();
  if (!hasPermission(key, 'tasks:read')) return forbidden('tasks:read');

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // 'active' | 'completed' | 'all'
  const category = searchParams.get('category');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  const supabase = getServiceClient();

  let query = supabase
    .from('product_initiatives')
    .select('id, title, problem_statement, item_type, phase, status, manual_order, completed_at, created_at, updated_at')
    .limit(limit);

  // Filter by status
  if (status === 'active' || !status) {
    query = query.eq('phase', 'backlog');
    query = query.order('manual_order', { ascending: true });
  } else if (status === 'completed') {
    query = query.eq('phase', 'finalized');
    query = query.order('completed_at', { ascending: false });
  } else {
    // 'all' — both backlog and finalized
    query = query.in('phase', ['backlog', 'finalized']);
    query = query.order('created_at', { ascending: false });
  }

  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.eq('item_type', category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error listando tareas', details: error.message }, { status: 500 });
  }

  const tasks = (data || []).map(t => ({
    id: t.id,
    title: t.title,
    description: t.problem_statement,
    category: normalizeCategory(t.item_type),
    status: t.phase === 'finalized' ? 'completed' : 'active',
    priority: t.manual_order,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  return NextResponse.json({ tasks, total: tasks.length });
}

// ─── POST: Crear tarea ───

export async function POST(request: NextRequest) {
  const key = await validateApiKey(request);
  if (!key) return unauthorized();
  if (!hasPermission(key, 'tasks:write')) return forbidden('tasks:write');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { title, description, category } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Campo requerido: title (string)' }, { status: 400 });
  }
  if (title.length > 80) {
    return NextResponse.json({ error: 'title excede 80 caracteres' }, { status: 400 });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Categoría no válida: "${category}". Opciones: ${VALID_CATEGORIES.join(', ')}` },
      { status: 422 }
    );
  }

  const supabase = getServiceClient();

  // Get max order
  const { data: maxData } = await supabase
    .from('product_initiatives')
    .select('manual_order')
    .eq('phase', 'backlog')
    .order('manual_order', { ascending: false })
    .limit(1);

  const maxOrder = maxData?.[0]?.manual_order || 0;

  const { data: task, error } = await supabase
    .from('product_initiatives')
    .insert({
      title: title.trim(),
      problem_statement: description || null,
      item_type: category || 'producto',
      phase: 'backlog',
      status: 'pending',
      manual_order: maxOrder + 1,
    })
    .select('id, title, problem_statement, item_type, manual_order, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error creando tarea', details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      description: task.problem_statement,
      category: task.item_type,
      status: 'active',
      priority: task.manual_order,
      created_at: task.created_at,
    },
    api_key: key.name,
  }, { status: 201 });
}

// ─── PATCH: Completar o actualizar tarea ───

export async function PATCH(request: NextRequest) {
  const key = await validateApiKey(request);
  if (!key) return unauthorized();
  if (!hasPermission(key, 'tasks:write')) return forbidden('tasks:write');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { id, action, title, description, category } = body;

  if (!id) {
    return NextResponse.json({ error: 'Campo requerido: id' }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Verify task exists
  const { data: existing } = await supabase
    .from('product_initiatives')
    .select('id, phase')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: `Tarea no encontrada: ${id}` }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  // Action: complete
  if (action === 'complete') {
    updates.phase = 'finalized';
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }
  // Action: reopen
  else if (action === 'reopen') {
    updates.phase = 'backlog';
    updates.status = 'pending';
    updates.completed_at = null;
  }

  // Field updates
  if (title) updates.title = title.trim().slice(0, 80);
  if (description !== undefined) updates.problem_statement = description || null;
  if (category && VALID_CATEGORIES.includes(category)) updates.item_type = category;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin cambios. Envía action (complete/reopen) o campos a actualizar.' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('product_initiatives')
    .update(updates)
    .eq('id', id)
    .select('id, title, problem_statement, item_type, phase, status, completed_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Error actualizando tarea', details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    task: {
      id: updated.id,
      title: updated.title,
      description: updated.problem_statement,
      category: updated.item_type,
      status: updated.phase === 'finalized' ? 'completed' : 'active',
      completed_at: updated.completed_at,
      updated_at: updated.updated_at,
    },
    api_key: key.name,
  });
}
