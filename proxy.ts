import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    (pathname.startsWith('/admin') && pathname !== '/admin/login') ||
    pathname === '/checkin' ||
    pathname.startsWith('/checkin/');

  if (needsAuth) {
    const session = request.cookies.get('admin_session')?.value;
    if (session !== '1') {
      const loginUrl = new URL('/admin/login', request.url);
      if (pathname.startsWith('/checkin')) {
        loginUrl.searchParams.set('redirect', '/checkin');
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/checkin', '/checkin/:path*'],
};
