// POST /api/communication/delete-template
// Deletes a template from Meta/Kapso. Local DB deletion is handled by the frontend.

import { NextRequest, NextResponse } from 'next/server';
import { deleteTemplateFromMeta } from '@/lib/kapso';

export async function POST(req: NextRequest) {
  const { metaName } = await req.json();

  if (!metaName) {
    return NextResponse.json({ error: 'metaName required' }, { status: 400 });
  }

  try {
    await deleteTemplateFromMeta(metaName);
    return NextResponse.json({ ok: true, meta_deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[delete-template] Meta deletion failed:', message);
    // Return ok anyway — don't block local deletion if Meta fails
    return NextResponse.json({ ok: true, meta_deleted: false, meta_error: message });
  }
}
