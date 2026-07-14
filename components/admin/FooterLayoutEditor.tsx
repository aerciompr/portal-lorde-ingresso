'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  type FooterLayout,
  type FooterWidget,
  type FooterWidgetType,
  newWidget,
  parseFooterLayout,
  serializeFooterLayout,
} from '@/lib/footer-layout';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="h-28 rounded-xl border border-white/10 bg-zinc-950 animate-pulse" />
  ),
});

const TYPE_LABELS: Record<FooterWidgetType, string> = {
  richtext: 'Texto rico',
  logo: 'Logo extra',
  hours: 'Horário',
  social: 'Redes (WA/IG/e-mail)',
  links: 'Links',
  copyright: 'Copyright',
};

type Props = {
  settings: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
  /** Salva só o rodapé no servidor (botão dedicado) */
  onSaveFooter?: (payload: Record<string, string>) => Promise<boolean | void>;
};

export default function FooterLayoutEditor({ settings, onChange, onSaveFooter }: Props) {
  const year = String(new Date().getFullYear());
  const siteName = settings.site_name || 'Lorde Nelson';

  const layout = useMemo(
    () =>
      parseFooterLayout(settings.footer_layout, {
        left: settings.footer_left,
        right: settings.footer_right,
        year,
        siteName,
      }),
    // re-parse when footer_layout or legacy changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.footer_layout, settings.footer_left, settings.footer_right, settings.site_name]
  );

  const [openId, setOpenId] = useState<string | null>(layout.widgets[0]?.id || null);
  const [savingFooter, setSavingFooter] = useState(false);
  // espelho local do JSON — garante que o que está na tela é o que grava
  const [layoutJson, setLayoutJson] = useState(() =>
    serializeFooterLayout(
      parseFooterLayout(settings.footer_layout, {
        left: settings.footer_left,
        right: settings.footer_right,
        year,
        siteName,
      })
    )
  );

  function commit(next: FooterLayout) {
    const json = serializeFooterLayout(next);
    setLayoutJson(json);
    onChange({ footer_layout: json });
  }

  async function handleSaveFooter() {
    if (!onSaveFooter) return;
    setSavingFooter(true);
    try {
      // usa layoutJson atual (última edição), não settings possivelmente stale
      await onSaveFooter({
        footer_layout: layoutJson || settings.footer_layout || '',
      });
    } finally {
      setSavingFooter(false);
    }
  }

  function updateWidget(id: string, patch: Partial<FooterWidget>) {
    commit({
      ...layout,
      widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
  }

  function removeWidget(id: string) {
    if (!confirm('Remover este bloco do rodapé?')) return;
    commit({
      ...layout,
      widgets: layout.widgets.filter((w) => w.id !== id),
    });
    if (openId === id) setOpenId(null);
  }

  function moveWidget(id: string, dir: -1 | 1) {
    const idx = layout.widgets.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= layout.widgets.length) return;
    const widgets = [...layout.widgets];
    [widgets[idx], widgets[j]] = [widgets[j], widgets[idx]];
    commit({ ...layout, widgets });
  }

  function addWidget(type: FooterWidgetType) {
    const w = newWidget(type, Math.min(layout.columns - 1, 0));
    commit({ ...layout, widgets: [...layout.widgets, w] });
    setOpenId(w.id);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="font-medium text-emerald-400 mb-1">Rodapé (widgets)</div>
        <p className="text-xs text-zinc-500">
          Monte o rodapé em blocos. Texto usa o editor avançado. Redes puxam WhatsApp / Instagram /
          e-mail da aba Contato.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <div className="label mb-1">Colunas</div>
          <select
            className="input w-auto min-w-[100px]"
            value={layout.columns}
            onChange={(e) =>
              commit({
                ...layout,
                columns: Number(e.target.value) as 1 | 2 | 3,
              })
            }
          >
            <option value={1}>1 coluna</option>
            <option value={2}>2 colunas</option>
            <option value={3}>3 colunas</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={layout.showLogo}
            onChange={(e) => commit({ ...layout, showLogo: e.target.checked })}
          />
          Mostrar logo na 1ª coluna
        </label>
      </div>

      <div className="space-y-2">
        {layout.widgets.map((w, i) => (
          <div
            key={w.id}
            className="rounded-2xl border border-white/10 bg-zinc-950/50 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <button
                type="button"
                className="text-left flex-1 min-w-0 text-sm font-medium text-zinc-200 truncate"
                onClick={() => setOpenId(openId === w.id ? null : w.id)}
              >
                {TYPE_LABELS[w.type]}
                {w.title ? ` · ${w.title}` : ''}
                <span className="text-zinc-600 font-normal"> · col {w.col + 1}</span>
              </button>
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-white px-1"
                onClick={() => moveWidget(w.id, -1)}
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-white px-1"
                onClick={() => moveWidget(w.id, 1)}
                disabled={i === layout.widgets.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 px-1"
                onClick={() => removeWidget(w.id)}
              >
                Remover
              </button>
            </div>

            {openId === w.id && (
              <div className="p-3 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <div className="label mb-1">Coluna</div>
                    <select
                      className="input"
                      value={w.col}
                      onChange={(e) =>
                        updateWidget(w.id, {
                          col: Math.min(layout.columns - 1, Number(e.target.value)),
                        })
                      }
                    >
                      {Array.from({ length: layout.columns }, (_, c) => (
                        <option key={c} value={c}>
                          Coluna {c + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  {w.type !== 'logo' && w.type !== 'social' && w.type !== 'copyright' && (
                    <div>
                      <div className="label mb-1">Título do bloco (opcional)</div>
                      <input
                        className="input"
                        value={w.title || ''}
                        onChange={(e) => updateWidget(w.id, { title: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {w.type === 'richtext' && (
                  <div>
                    <div className="label mb-1">Conteúdo</div>
                    <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-900">
                      <RichTextEditor
                        value={w.html || ''}
                        onChange={(html) => updateWidget(w.id, { html })}
                        placeholder="Endereço, texto livre…"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Use {'{year}'} no texto para o ano atual.
                    </p>
                  </div>
                )}

                {w.type === 'hours' && (
                  <div>
                    <div className="label mb-1">Linhas (uma por linha)</div>
                    <textarea
                      className="input min-h-[80px]"
                      value={(w.lines || []).join('\n')}
                      onChange={(e) =>
                        updateWidget(w.id, {
                          lines: e.target.value.split('\n'),
                        })
                      }
                    />
                  </div>
                )}

                {w.type === 'copyright' && (
                  <div>
                    <div className="label mb-1">Linha extra (opcional)</div>
                    <input
                      className="input"
                      placeholder="Portal de ingressos"
                      value={w.copyrightExtra || ''}
                      onChange={(e) =>
                        updateWidget(w.id, { copyrightExtra: e.target.value })
                      }
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Sempre mostra © {year} {siteName}
                    </p>
                  </div>
                )}

                {w.type === 'logo' && (
                  <div>
                    <div className="label mb-1">Tamanho</div>
                    <select
                      className="input w-auto"
                      value={w.logoSize || 'md'}
                      onChange={(e) =>
                        updateWidget(w.id, {
                          logoSize: e.target.value as 'sm' | 'md',
                        })
                      }
                    >
                      <option value="sm">Pequeno</option>
                      <option value="md">Médio</option>
                    </select>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Usa a logo da seção acima. Prefira “Mostrar logo na 1ª coluna” se for a marca
                      principal.
                    </p>
                  </div>
                )}

                {w.type === 'social' && (
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
                    {(['whatsapp', 'instagram', 'email'] as const).map((key) => {
                      const checked = (w.socialItems || []).includes(key);
                      return (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const set = new Set(w.socialItems || []);
                              if (e.target.checked) set.add(key);
                              else set.delete(key);
                              updateWidget(w.id, {
                                socialItems: Array.from(set),
                              });
                            }}
                          />
                          {key === 'whatsapp'
                            ? 'WhatsApp'
                            : key === 'instagram'
                              ? 'Instagram'
                              : 'E-mail / Contato'}
                        </label>
                      );
                    })}
                  </div>
                )}

                {w.type === 'links' && (
                  <div className="space-y-2">
                    {(w.links || []).map((link, li) => (
                      <div key={li} className="flex flex-wrap gap-2">
                        <input
                          className="input flex-1 min-w-[120px]"
                          placeholder="Rótulo"
                          value={link.label}
                          onChange={(e) => {
                            const links = [...(w.links || [])];
                            links[li] = { ...links[li], label: e.target.value };
                            updateWidget(w.id, { links });
                          }}
                        />
                        <input
                          className="input flex-1 min-w-[140px]"
                          placeholder="/eventos ou https://..."
                          value={link.href}
                          onChange={(e) => {
                            const links = [...(w.links || [])];
                            links[li] = { ...links[li], href: e.target.value };
                            updateWidget(w.id, { links });
                          }}
                        />
                        <button
                          type="button"
                          className="text-xs text-red-400 px-2"
                          onClick={() => {
                            const links = (w.links || []).filter((_, j) => j !== li);
                            updateWidget(w.id, { links });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs text-emerald-400 hover:underline"
                      onClick={() =>
                        updateWidget(w.id, {
                          links: [...(w.links || []), { label: '', href: '' }],
                        })
                      }
                    >
                      + link
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-zinc-500 self-center mr-1">Adicionar:</span>
        {(Object.keys(TYPE_LABELS) as FooterWidgetType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addWidget(t)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            + {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-white/10">
        {onSaveFooter && (
          <button
            type="button"
            className="btn btn-primary text-sm px-6 disabled:opacity-50"
            disabled={savingFooter}
            onClick={() => void handleSaveFooter()}
          >
            {savingFooter ? 'Salvando rodapé…' : 'Salvar rodapé agora'}
          </button>
        )}
        <p className="text-[10px] text-zinc-600">
          Ou use <strong className="text-zinc-400">Salvar configurações</strong> no final da página
          (grava tudo, inclusive rodapé).
        </p>
      </div>
    </div>
  );
}
