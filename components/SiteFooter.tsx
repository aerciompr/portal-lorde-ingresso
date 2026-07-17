import Link from 'next/link';
import {
  type FooterContact,
  type FooterLayout,
  type FooterWidget,
  sanitizeFooterHtml,
} from '@/lib/footer-layout';
import { injectContactTokens } from '@/lib/contact';

type Props = {
  layout: FooterLayout;
  contact: FooterContact;
};

function WidgetBlock({
  w,
  contact,
  year,
}: {
  w: FooterWidget;
  contact: FooterContact;
  year: string;
}) {
  const title = (w.title || '').trim();

  if (w.type === 'logo') {
    const size = w.logoSize === 'sm' ? 'h-10' : 'h-12';
    return (
      <div className="mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={contact.logoUrl || '/logo-lordenelson.jpg'}
          alt={contact.siteName}
          className={`${size === 'h-10' ? 'h-10' : 'h-12'} w-auto max-w-[140px] object-contain bg-transparent`}
        />
      </div>
    );
  }

  if (w.type === 'hours') {
    const lines = (w.lines || []).filter(Boolean);
    if (!lines.length) return null;
    return (
      <div className="mb-4">
        {title ? <div className="text-zinc-300 font-medium mb-1.5 text-sm">{title}</div> : null}
        <div className="space-y-0.5 text-zinc-500">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  if (w.type === 'copyright') {
    return (
      <div className="mb-4 space-y-1 text-zinc-500">
        <p>
          © {year} {contact.siteName}
        </p>
        {w.copyrightExtra ? <p className="text-zinc-600 text-xs">{w.copyrightExtra}</p> : null}
      </div>
    );
  }

  if (w.type === 'links') {
    const links = (w.links || []).filter((l) => l.label && l.href);
    if (!links.length) return null;
    return (
      <div className="mb-4">
        {title ? <div className="text-zinc-300 font-medium mb-1.5 text-sm">{title}</div> : null}
        <ul className="space-y-1">
          {links.map((l, i) => {
            const external = /^https?:\/\//i.test(l.href);
            return (
              <li key={i}>
                {external ? (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-white transition"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className="text-zinc-400 hover:text-white transition">
                    {l.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (w.type === 'social') {
    // undefined = legado (mostra as 3); [] = nenhuma (usuário desmarcou tudo)
    const items = Array.isArray(w.socialItems)
      ? w.socialItems
      : (['whatsapp', 'instagram', 'email'] as const);
    const ig = (contact.instagramUrl || '').trim();
    const igHref = ig
      ? ig.startsWith('http')
        ? ig
        : `https://instagram.com/${ig.replace(/^@/, '')}`
      : '';

    return (
      <div className="mb-4">
        {title ? <div className="text-zinc-300 font-medium mb-2 text-sm">{title}</div> : null}
        <div className="flex flex-wrap items-center gap-4 text-lg">
          {items.includes('whatsapp') && contact.whatsappHref ? (
            <a
              href={contact.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#25D366] hover:text-[#3be07a] transition"
              aria-label={`WhatsApp ${contact.whatsappDisplay}`}
            >
              <i className="fa-brands fa-whatsapp text-xl leading-none" aria-hidden />
              <span className="text-zinc-400 hover:text-zinc-200 hidden sm:inline">
                {contact.whatsappDisplay}
              </span>
            </a>
          ) : null}
          {items.includes('instagram') && igHref ? (
            <a
              href={igHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-400/90 hover:text-pink-300 transition"
              aria-label="Instagram"
            >
              <i className="fa-brands fa-instagram text-xl leading-none" aria-hidden />
            </a>
          ) : null}
          {items.includes('email') ? (
            <>
              <Link
                href="/contato"
                className="text-emerald-400/90 hover:text-emerald-300 transition"
                aria-label="Contato"
              >
                <i className="fa-solid fa-envelope text-lg leading-none" aria-hidden />
              </Link>
              {contact.contactEmail ? (
                <a
                  href={`mailto:${contact.contactEmail}`}
                  className="text-zinc-500 hover:text-zinc-300 text-xs sm:text-sm transition hidden md:inline"
                >
                  {contact.contactEmail}
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // richtext — tokens {whatsapp} {email} etc. vêm do Admin → Contato
  const html = injectContactTokens(
    sanitizeFooterHtml(w.html || '', year),
    contact
  );
  if (!html.replace(/<[^>]+>/g, '').trim() && !title) return null;
  return (
    <div className="mb-4">
      {title ? <div className="text-zinc-300 font-medium mb-1.5 text-sm">{title}</div> : null}
      <div
        className="footer-richtext space-y-1 leading-relaxed text-zinc-500 [&>p]:mb-1 [&>ul]:list-disc [&>ul]:pl-4 [&>a]:text-emerald-400 hover:[&>a]:underline"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default function SiteFooter({ layout, contact }: Props) {
  const year = contact.year;
  const cols = layout.columns === 1 ? 1 : layout.columns === 3 ? 3 : 2;
  const gridCls =
    cols === 1
      ? 'grid grid-cols-1 gap-8'
      : cols === 3
        ? 'grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10'
        : 'grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12';

  const byCol: FooterWidget[][] = Array.from({ length: cols }, () => []);
  for (const w of layout.widgets) {
    const c = Math.min(cols - 1, Math.max(0, w.col));
    byCol[c].push(w);
  }

  return (
    <footer className="border-t border-white/10 py-12 text-sm text-zinc-500">
      <div className={`max-w-6xl mx-auto px-6 ${gridCls} items-start`}>
        {byCol.map((widgets, colIdx) => (
          <div
            key={colIdx}
            className={
              colIdx === cols - 1 && cols > 1
                ? 'md:text-right md:[&_.footer-richtext]:text-right'
                : ''
            }
          >
            {layout.showLogo && colIdx === 0 ? (
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contact.logoUrl || '/logo-lordenelson.jpg'}
                  alt={contact.siteName}
                  className="h-11 w-auto max-w-[140px] object-contain bg-transparent"
                />
              </div>
            ) : null}
            {widgets.map((w) => (
              <div
                key={w.id}
                className={colIdx === cols - 1 && cols > 1 ? 'md:flex md:flex-col md:items-end' : ''}
              >
                <WidgetBlock w={w} contact={contact} year={year} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
