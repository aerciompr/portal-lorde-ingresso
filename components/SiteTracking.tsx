import Script from 'next/script';
import type { TrackingSettings } from '@/lib/tracking';
import { hasAnyTracking } from '@/lib/tracking';
import InjectHtml from '@/components/InjectHtml';

/**
 * Pixels conhecidos (Next Script) + HTML livre (head/body).
 * Só renderiza no layout raiz (SSR + afterInteractive).
 */
export default function SiteTracking({ tracking }: { tracking: TrackingSettings }) {
  if (!hasAnyTracking(tracking)) return null;

  const { metaPixelId, googleAnalyticsId, googleTagManagerId, headHtml, bodyHtml } = tracking;

  return (
    <>
      {/* Google Tag Manager */}
      {googleTagManagerId ? (
        <>
          <Script id="gtm-base" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${googleTagManagerId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      ) : null}

      {/* Google Analytics 4 / gtag */}
      {googleAnalyticsId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());gtag('config', '${googleAnalyticsId}');`}
          </Script>
        </>
      ) : null}

      {/* Meta / Facebook Pixel */}
      {metaPixelId ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}

      {/* HTML livre (admin) */}
      {headHtml.trim() ? <InjectHtml html={headHtml} target="head" /> : null}
      {bodyHtml.trim() ? <InjectHtml html={bodyHtml} target="body" /> : null}
    </>
  );
}
