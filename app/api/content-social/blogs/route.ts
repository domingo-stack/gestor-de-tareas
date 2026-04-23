import { NextResponse } from 'next/server';

const API_URL = process.env.CALIFICA_API_URL || 'https://califica.ai';
const API_KEY = process.env.CALIFICA_API_KEY;

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: 'CALIFICA_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const res = await fetch(`${API_URL}/api/content/blog-list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API error: ${res.status}`, details: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Error conectando al API de califica.ai' }, { status: 502 });
  }
}
