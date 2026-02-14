import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/admin', '/finance', '/revenue'];
const PUBLIC_ROUTES = ['/login', '/register', '/accept-invite'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const isPublicRoute = PUBLIC_ROUTES.some(r => req.nextUrl.pathname.startsWith(r));

  // Redirigir a login si no hay sesión y no es ruta pública
  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Verificar roles para rutas protegidas (admin/finance/revenue)
  const isProtectedRoute = PROTECTED_ROUTES.some(r => req.nextUrl.pathname.startsWith(r));
  if (isProtectedRoute && session) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!data || (data.role !== 'superadmin' && data.role !== 'Dueño')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.css$).*)'],
};
