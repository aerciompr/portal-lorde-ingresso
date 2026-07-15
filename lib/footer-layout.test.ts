import { describe, expect, it } from 'vitest';
import {
  parseFooterLayout,
  serializeFooterLayout,
  stripWhatsAppFromFooterLayout,
  type FooterLayout,
} from './footer-layout';

describe('footer socialItems', () => {
  it('preserva social sem whatsapp no round-trip', () => {
    const layout: FooterLayout = {
      columns: 2,
      showLogo: true,
      widgets: [
        {
          id: 's1',
          col: 1,
          type: 'social',
          socialItems: ['instagram', 'email'],
        },
      ],
    };
    const json = serializeFooterLayout(layout);
    const parsed = parseFooterLayout(json, {});
    const social = parsed.widgets.find((w) => w.type === 'social');
    expect(social?.socialItems).toEqual(['instagram', 'email']);
    expect(social?.socialItems).not.toContain('whatsapp');
  });

  it('preserva socialItems vazio', () => {
    const layout: FooterLayout = {
      columns: 2,
      showLogo: true,
      widgets: [{ id: 's1', col: 1, type: 'social', socialItems: [] }],
    };
    const parsed = parseFooterLayout(serializeFooterLayout(layout), {});
    expect(parsed.widgets[0].socialItems).toEqual([]);
  });

  it('stripWhatsApp remove rede e texto', () => {
    const layout: FooterLayout = {
      columns: 2,
      showLogo: true,
      widgets: [
        {
          id: 'r1',
          col: 0,
          type: 'richtext',
          html: '<p>Local</p><p>WhatsApp (82) 99647-1998</p>',
        },
        {
          id: 's1',
          col: 1,
          type: 'social',
          socialItems: ['whatsapp', 'instagram'],
        },
      ],
    };
    const next = stripWhatsAppFromFooterLayout(layout);
    const social = next.widgets.find((w) => w.type === 'social');
    const rich = next.widgets.find((w) => w.type === 'richtext');
    expect(social?.socialItems).toEqual(['instagram']);
    expect(rich?.html || '').not.toMatch(/whatsapp/i);
  });
});
