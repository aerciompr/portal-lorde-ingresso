/**
 * Layout do rodapé em widgets (admin + site).
 * Setting key: footer_layout (JSON string).
 * Fallback: footer_left / footer_right (legado).
 */

export type FooterWidgetType =
  | 'richtext'
  | 'logo'
  | 'hours'
  | 'social'
  | 'links'
  | 'copyright';

export type FooterLinkItem = { label: string; href: string };

export type FooterWidget = {
  id: string;
  col: number; // 0-based
  type: FooterWidgetType;
  title?: string;
  html?: string;
  lines?: string[];
  /** social: whatsapp | instagram | email */
  socialItems?: Array<'whatsapp' | 'instagram' | 'email'>;
  links?: FooterLinkItem[];
  copyrightExtra?: string;
  logoSize?: 'sm' | 'md';
};

export type FooterLayout = {
  columns: 1 | 2 | 3;
  showLogo: boolean;
  widgets: FooterWidget[];
};

export type FooterContact = {
  siteName: string;
  logoUrl: string;
  year: string;
  whatsappDisplay: string;
  whatsappHref: string;
  instagramUrl: string;
  contactEmail: string;
};

function uid() {
  return `w_${Math.random().toString(36).slice(2, 10)}`;
}

/** Converte textarea legado (\n, •) em HTML simples */
export function plainFooterToHtml(text: string, year: string): string {
  const raw = (text || '').replace(/\{year\}/g, year);
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s*[•·]\s*/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Allowlist simples de tags do TipTap no rodapé */
export function sanitizeFooterHtml(html: string, year = ''): string {
  let s = (html || '').replace(/\{year\}/g, year);
  // remove scripts/styles
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  // strip tags not in allowlist
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (full, tag: string) => {
    const t = tag.toLowerCase();
    const allowed = [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'a',
      'h3',
      'h4',
      'span',
    ];
    if (!allowed.includes(t)) return '';
    if (t === 'br') return '<br />';
    if (t === 'a') {
      // keep only href http(s) or /
      const hrefMatch = full.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
      const href = (hrefMatch?.[2] || hrefMatch?.[3] || '').trim();
      if (!href || /^(javascript|data):/i.test(href)) return full.startsWith('</') ? '</a>' : '';
      if (!/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(href)) {
        return full.startsWith('</') ? '</a>' : '';
      }
      const closing = full.startsWith('</');
      if (closing) return '</a>';
      return `<a href="${href.replace(/"/g, '')}" rel="noopener noreferrer">`;
    }
    return full.startsWith('</') ? `</${t}>` : `<${t}>`;
  });
  return s;
}

export function defaultFooterLayout(siteName = 'Lorde Nelson'): FooterLayout {
  return {
    columns: 2,
    showLogo: true,
    widgets: [
      {
        id: uid(),
        col: 0,
        type: 'richtext',
        title: 'Local',
        html: `<p><strong>${escapeHtml(siteName)} Rest Pub</strong></p><p>Rua Silvério Jorge, 241</p><p>Jaraguá — Maceió/AL</p>`,
      },
      {
        id: uid(),
        col: 0,
        type: 'hours',
        title: 'Horário',
        lines: ['Qui a Sáb', '20h às 02h'],
      },
      {
        id: uid(),
        col: 1,
        type: 'copyright',
        copyrightExtra: 'Portal de ingressos · Check-in no local',
      },
      {
        id: uid(),
        col: 1,
        type: 'links',
        title: 'Links',
        links: [
          { label: 'Programação', href: '/eventos' },
          {
            label: 'Cardápio',
            href: 'https://lordenelsonbar.saipos.com/lorde-nelson-1096-bar/table/dqmtsst',
          },
          { label: 'Meus Ingressos', href: '/ingressos' },
          { label: 'Contato', href: '/contato' },
        ],
      },
      {
        id: uid(),
        col: 1,
        type: 'social',
        socialItems: ['whatsapp', 'instagram', 'email'],
      },
    ],
  };
}

export function migrateLegacyFooter(
  left: string,
  right: string,
  year: string,
  siteName: string
): FooterLayout {
  const base = defaultFooterLayout(siteName);
  const widgets: FooterWidget[] = [];
  if ((left || '').trim()) {
    widgets.push({
      id: uid(),
      col: 0,
      type: 'richtext',
      title: 'Local',
      html: plainFooterToHtml(left, year) || `<p>${escapeHtml(left)}</p>`,
    });
  } else {
    widgets.push(...base.widgets.filter((w) => w.col === 0));
  }
  if ((right || '').trim()) {
    widgets.push({
      id: uid(),
      col: 1,
      type: 'richtext',
      title: '',
      html: plainFooterToHtml(right, year) || `<p>${escapeHtml(right)}</p>`,
    });
  }
  widgets.push({
    id: uid(),
    col: 1,
    type: 'social',
    socialItems: ['whatsapp', 'instagram', 'email'],
  });
  widgets.push({
    id: uid(),
    col: 1,
    type: 'links',
    links: [
      { label: 'Programação', href: '/eventos' },
      {
        label: 'Cardápio',
        href: 'https://lordenelsonbar.saipos.com/lorde-nelson-1096-bar/table/dqmtsst',
      },
      { label: 'Meus Ingressos', href: '/ingressos' },
      { label: 'Contato', href: '/contato' },
    ],
  });
  return { columns: 2, showLogo: true, widgets };
}

export function parseFooterLayout(
  rawJson: string | undefined | null,
  legacy: { left?: string; right?: string; year?: string; siteName?: string }
): FooterLayout {
  const year = legacy.year || String(new Date().getFullYear());
  const siteName = legacy.siteName || 'Lorde Nelson';

  if (rawJson && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson) as FooterLayout;
      if (parsed && Array.isArray(parsed.widgets)) {
        const cols = parsed.columns === 1 || parsed.columns === 3 ? parsed.columns : 2;
        return {
          columns: cols,
          showLogo: parsed.showLogo !== false,
          widgets: parsed.widgets
            .filter((w) => w && w.type && typeof w.col === 'number')
            .map((w) => {
              const base = {
                ...w,
                id: w.id || uid(),
                col: Math.max(0, Math.min(2, Number(w.col) || 0)),
              };
              // social sem lista explícita = legado com as 3 redes (UI e site iguais)
              if (base.type === 'social' && !Array.isArray(base.socialItems)) {
                base.socialItems = ['whatsapp', 'instagram', 'email'];
              }
              // socialItems: [] = nenhuma rede (respeitar)
              return base;
            }),
        };
      }
    } catch {
      /* fall through */
    }
  }

  if ((legacy.left || '').trim() || (legacy.right || '').trim()) {
    return migrateLegacyFooter(legacy.left || '', legacy.right || '', year, siteName);
  }

  return defaultFooterLayout(siteName);
}

export function newWidget(type: FooterWidgetType, col = 0): FooterWidget {
  const id = uid();
  switch (type) {
    case 'richtext':
      return { id, col, type, title: 'Texto', html: '<p></p>' };
    case 'logo':
      return { id, col, type, logoSize: 'md' };
    case 'hours':
      return { id, col, type, title: 'Horário', lines: ['Qui a Sáb', '20h às 02h'] };
    case 'social':
      return { id, col, type, socialItems: ['whatsapp', 'instagram', 'email'] };
    case 'links':
      return {
        id,
        col,
        type,
        title: 'Links',
        links: [{ label: 'Programação', href: '/eventos' }],
      };
    case 'copyright':
      return { id, col, type, copyrightExtra: '' };
    default:
      return { id, col, type: 'richtext', html: '<p></p>' };
  }
}

/** Remove classes/attrs pesados do TipTap para caber no MySQL e limpar HTML */
function minifyFooterHtml(html: string): string {
  return (html || '')
    .replace(/\sclass="[^"]*"/gi, '')
    .replace(/\sclass='[^']*'/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\sdata-[a-z-]+="[^"]*"/gi, '')
    .replace(/>\s+</g, '><')
    .trim();
}

export function serializeFooterLayout(layout: FooterLayout): string {
  // Garante socialItems sempre serializado (array, mesmo vazio)
  const widgets = (layout.widgets || []).map((w) => {
    if (w.type === 'richtext') {
      return { ...w, html: minifyFooterHtml(w.html || '') };
    }
    if (w.type !== 'social') return w;
    return {
      ...w,
      socialItems: Array.isArray(w.socialItems)
        ? w.socialItems
        : (['whatsapp', 'instagram', 'email'] as FooterWidget['socialItems']),
    };
  });
  return JSON.stringify({
    columns: layout.columns,
    showLogo: layout.showLogo,
    widgets,
  });
}

/** Remove whatsapp de todos os blocos social + linhas de texto que citam WhatsApp */
export function stripWhatsAppFromFooterLayout(layout: FooterLayout): FooterLayout {
  return {
    ...layout,
    widgets: layout.widgets.map((w) => {
      if (w.type === 'social') {
        const items = (w.socialItems ?? ['whatsapp', 'instagram', 'email']).filter(
          (i) => i !== 'whatsapp'
        );
        return { ...w, socialItems: items };
      }
      if (w.type === 'richtext' && w.html) {
        let html = w.html;
        // remove parágrafos / list items que mencionam WhatsApp
        html = html.replace(
          /<(p|li)(\s[^>]*)?>[\s\S]*?whatsapp[\s\S]*?<\/\1>/gi,
          ''
        );
        html = html.replace(/whatsapp\s*[:\-]?\s*[\d\s().+-]{8,}/gi, '');
        return { ...w, html };
      }
      return w;
    }),
  };
}
