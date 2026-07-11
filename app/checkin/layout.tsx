import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminSessionCookie } from '@/lib/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Check-in | Lorde Nelson',
  manifest: '/manifest.webmanifest',
  themeColor: '#10b981',
  appleWebApp: {
    capable: true,
    title: 'LN Check-in',
    statusBarStyle: 'black-translucent',
  },
};

export default async function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session')?.value;

  if (!verifyAdminSessionCookie(session)) {
    redirect('/admin/login?redirect=/checkin');
  }

  return (
    <>
      <link rel="manifest" href="/manifest.webmanifest" />
      {children}
    </>
  );
}
