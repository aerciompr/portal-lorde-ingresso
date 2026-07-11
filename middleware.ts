import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminSessionCookie } from '@/lib/auth-edge';

/**
 * Protege páginas admin e check-in no edge.
 * APIs admin também checam isAdmin() no Node.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    (pathname.startsWith('/admin') && pathname !== '/admin/login') ||
    pathname === '/checkin' ||
    pathname.startsWith('/checkin/');

  if (!needsAuth) return NextResponse.next();

  const session = request.cookies.get('admin_session')?.value;
  if (!(await verifyAdminSessionCookie(session))) {
    const loginUrl = new URL('/admin/login', request.url);
    if (pathname.startsWith('/checkin')) {
      loginUrl.searchParams.set('redirect', '/checkin');
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/checkin', '/checkin/:path*'],
};
