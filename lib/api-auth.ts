import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  permissions: string[];
}

/**
 * Validates API key from Authorization header against api_keys table.
 * Returns the key record if valid, null if invalid.
 * Also updates last_used timestamp.
 */
export async function validateApiKey(request: NextRequest): Promise<ApiKeyRecord | null> {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;

  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  const hashed = await hashKey(token);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, permissions')
    .eq('key_hash', hashed)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  // Update last_used
  supabase.from('api_keys').update({ last_used: new Date().toISOString() }).eq('id', data.id);

  return data as ApiKeyRecord;
}

/**
 * Check if key has a specific permission
 */
export function hasPermission(key: ApiKeyRecord, permission: string): boolean {
  return key.permissions.includes(permission);
}

/**
 * Helper: return 401 response
 */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized — API key inválida o inactiva' }, { status: 401 });
}

/**
 * Helper: return 403 response
 */
export function forbidden(permission: string) {
  return NextResponse.json({ error: `Forbidden — se requiere permiso: ${permission}` }, { status: 403 });
}

/**
 * Get Supabase service client
 */
export function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}
