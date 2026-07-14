import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseAdminSessionCookie } from '@/lib/auth-edge';

/**
 * Next.js 16: arquivo de borda é `proxy.ts` (não `middleware.ts`).
 * Protege páginas admin e check-in. APIs admin também checam isAdmin() no Node.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    (pathname.startsWith('/admin') && pathname !== '/admin/login') ||
    pathname === '/checkin' ||
    pathname.startsWith('/checkin/');

  if (!needsAuth) return NextResponse.next();

  const session = request.cookies.get('admin_session')?.value;
  const parsed = await parseAdminSessionCookie(session);

  if (!parsed.ok) {
    const loginUrl = new URL('/admin/login', request.url);
    if (pathname.startsWith('/checkin')) {
      loginUrl.searchParams.set('redirect', '/checkin');
    }
    return NextResponse.redirect(loginUrl);
  }

  // Check-in only: bloqueia painel admin
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (parsed.role === 'checkin') {
      return NextResponse.redirect(new URL('/checkin', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/checkin', '/checkin/:path*'],
};
