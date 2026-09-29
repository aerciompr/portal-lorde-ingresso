'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getMarketingAttribution } from '@/lib/marketing-attribution';

/** O snippet base registra a primeira página; este componente cobre transições SPA do Next. */
export default function TrackingPageViews() {
  const pathname = usePathname();
  const search = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    // Registra UTMs/click IDs já na landing page, antes que o visitante navegue até o evento.
    getMarketingAttribution();
    if (first.current) {
      first.current = false;
      return;
    }
    const path = `${pathname}${search.toString() ? `?${search}` : ''}`;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'page_view', page_path: path });
    window.gtag?.('event', 'page_view', { page_path: path });
    window.fbq?.('track', 'PageView');
  }, [pathname, search]);

  return null;
}
