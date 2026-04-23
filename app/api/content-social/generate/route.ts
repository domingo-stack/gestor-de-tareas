import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.CALIFICA_API_URL || 'https://califica.ai';
const API_KEY = process.env.CALIFICA_API_KEY;

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'CALIFICA_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { blog_id, config } = body;

    if (!blog_id) {
      return NextResponse.json({ error: 'blog_id requerido' }, { status: 400 });
    }

    const res = await fetch(`${API_URL}/api/content/repurpose`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ blog_id, type: 'carousel', config }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `API error: ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Error generando contenido' }, { status: 502 });
  }
}
