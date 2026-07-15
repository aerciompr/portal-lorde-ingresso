'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  onSaveFooter?: (payload: Record<string, string>) => Promise<boolean | void>;
};

function parseFromSettings(settings: Record<string, string>): FooterLayout {
  return parseFooterLayout(settings.footer_layout, {
    left: settings.footer_left,
    right: settings.footer_right,
    year: String(new Date().getFullYear()),
    siteName: settings.site_name || 'Lorde Nelson',
  });
}

export default function FooterLayoutEditor({ settings, onChange, onSaveFooter }: Props) {
  const year = String(new Date().getFullYear());
  const siteName = settings.site_name || 'Lorde Nelson';

  const [layout, setLayout] = useState<FooterLayout>(() => parseFromSettings(settings));
  const layoutRef = useRef(layout);
  const [openId, setOpenId] = useState<string | null>(
    () => parseFromSettings(settings).widgets[0]?.id || null
  );
  const [savingFooter, setSavingFooter] = useState(false);
  /** true = usuário editou; não sobrescrever com load do servidor */
  const dirtyRef = useRef(false);
  const lastServerJson = useRef(settings.footer_layout || '');
  /** getHTML() de cada editor TipTap aberto (por widget id) */
  const editorApis = useRef(new Map<string, () => string>());

  // Só hidrata do servidor se não houver edição local pendente
  useEffect(() => {
    if (dirtyRef.current) return;
    const server = settings.footer_layout || '';
    if (server === lastServerJson.current) return;
    lastServerJson.current = server;
    const next = parseFromSettings(settings);
    layoutRef.current = next;
    setLayout(next);
  }, [settings.footer_layout, settings.footer_left, settings.footer_right, settings.site_name]);

  function commit(next: FooterLayout, opts?: { fromServer?: boolean }) {
    if (!opts?.fromServer) dirtyRef.current = true;
    layoutRef.current = next;
    setLayout(next);
    const json = serializeFooterLayout(next);
    onChange({ footer_layout: json });
  }

  /** Puxa HTML fresco do TipTap (evita perder o que ainda não entrou no state) */
  function flushRichTextEditors(): FooterLayout {
    let base = layoutRef.current;
    if (editorApis.current.size === 0) return base;
    let changed = false;
    const widgets = base.widgets.map((w) => {
      if (w.type !== 'richtext') return w;
      const getHtml = editorApis.current.get(w.id);
      if (!getHtml) return w;
      const html = getHtml();
      if (html === (w.html || '')) return w;
      changed = true;
      return { ...w, html };
    });
    if (!changed) return base;
    const next = { ...base, widgets };
    layoutRef.current = next;
    setLayout(next);
    return next;
  }

  async function handleSaveFooter() {
    if (!onSaveFooter) return;
    setSavingFooter(true);
    try {
      const flushed = flushRichTextEditors();
      const json = serializeFooterLayout(flushed);
      onChange({ footer_layout: json });

      const ok = await onSaveFooter({
        footer_layout: json,
        footer_left: '',
        footer_right: '',
      });

      if (ok !== false) {
        dirtyRef.current = false;
        lastServerJson.current = json;
      }
    } finally {
      setSavingFooter(false);
    }
  }

  function updateWidget(id: string, patch: Partial<FooterWidget>) {
    const base = layoutRef.current;
    commit({
      ...base,
      widgets: base.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
  }

  function removeWidget(id: string) {
    if (!confirm('Remover este bloco do rodapé?')) return;
    editorApis.current.delete(id);
    const base = layoutRef.current;
    commit({
      ...base,
      widgets: base.widgets.filter((w) => w.id !== id),
    });
    if (openId === id) setOpenId(null);
  }

  function moveWidget(id: string, dir: -1 | 1) {
    const base = layoutRef.current;
    const idx = base.widgets.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= base.widgets.length) return;
    const widgets = [...base.widgets];
    [widgets[idx], widgets[j]] = [widgets[j], widgets[idx]];
    commit({ ...base, widgets });
  }

  function addWidget(type: FooterWidgetType) {
    const base = layoutRef.current;
    const w = newWidget(type, Math.min(base.columns - 1, 0));
    commit({ ...base, widgets: [...base.widgets, w] });
    setOpenId(w.id);
  }

  const registerEditorApi = useCallback((widgetId: string) => {
    return (api: { getHTML: () => string } | null) => {
      if (api) editorApis.current.set(widgetId, api.getHTML);
      else editorApis.current.delete(widgetId);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <div className="font-medium text-emerald-400 mb-1">Rodapé (widgets)</div>
        <p className="text-xs text-zinc-500">
          Edite o texto e clique em <strong className="text-zinc-300">Salvar rodapé agora</strong>.
          Sem esse botão o site público não atualiza.
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
                ...layoutRef.current,
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
            onChange={(e) =>
              commit({ ...layoutRef.current, showLogo: e.target.checked })
            }
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
                          col: Math.min(
                            layoutRef.current.columns - 1,
                            Number(e.target.value)
                          ),
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
                  </div>
                )}

                {w.type === 'social' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500">
                      Desmarque para ocultar no site. Dados vêm da aba Contato.
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
                      {(['whatsapp', 'instagram', 'email'] as const).map((key) => {
                        const items = w.socialItems ?? [
                          'whatsapp',
                          'instagram',
                          'email',
                        ];
                        const checked = items.includes(key);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const base =
                                  w.socialItems ??
                                  (['whatsapp', 'instagram', 'email'] as const).slice();
                                const set = new Set(base);
                                if (e.target.checked) set.add(key);
                                else set.delete(key);
                                updateWidget(w.id, {
                                  socialItems: Array.from(set) as Array<
                                    'whatsapp' | 'instagram' | 'email'
                                  >,
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

            {/* TipTap sempre montado (visível se aberto) — flush no save não perde HTML */}
            {w.type === 'richtext' && (
              <div
                className={
                  openId === w.id
                    ? 'p-3 pt-0 border-t border-white/5'
                    : 'hidden'
                }
                aria-hidden={openId !== w.id}
              >
                {openId === w.id && (
                  <div className="label mb-1">Conteúdo</div>
                )}
                <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-900">
                  <RichTextEditor
                    value={w.html || ''}
                    onChange={(html) => updateWidget(w.id, { html })}
                    onEditorApi={registerEditorApi(w.id)}
                    placeholder="Endereço, texto livre…"
                  />
                </div>
                {openId === w.id && (
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Use {'{year}'} no texto. Depois: <strong>Salvar rodapé agora</strong>.
                  </p>
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
          Este botão grava o texto rico no banco. Depois atualize o site (Ctrl+F5).
        </p>
      </div>
    </div>
  );
}
