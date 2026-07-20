'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Header/footer do site público. Em /admin e /checkin fica sem chrome
 * (evita scroll da página + scroll do painel ao mesmo tempo).
 */
export default function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() || '';
  const bare =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkin');

  if (bare) {
    return <div className="min-h-full flex flex-col flex-1">{children}</div>;
  }

  return (
    <>
      {header}
      <main className="flex-1 min-w-0 max-w-[100vw] overflow-x-clip">{children}</main>
      {footer}
    </>
  );
}
