import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session')?.value;

  if (session !== '1') {
    redirect('/admin/login?redirect=/checkin');
  }

  return <>{children}</>;
}
