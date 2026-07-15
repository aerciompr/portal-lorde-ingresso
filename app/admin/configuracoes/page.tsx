'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import FooterLayoutEditor from '@/components/admin/FooterLayoutEditor';

type Tab = 'taxas' | 'regras' | 'pagamentos' | 'gateways' | 'visual' | 'contato' | 'marketing';
type VisualSub = 'marca' | 'banner' | 'rodape';

export default function AdminConfiguracoes() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>('visual');
  const [visualSub, setVisualSub] = useState<VisualSub>('marca');
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/settings', { credentials: 'include' });
    if (res.ok) setSettings(await res.json());
    else if (res.status === 401) toast.error('Sessão expirada — faça login de novo');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSettings(override?: Record<string, string>) {
    const payload = override ? { ...settings, ...override } : settings;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Falha ao salvar (${res.status})`);
        return false;
      }
      toast.success('Configurações salvas no banco');
      // atualiza estado local com o que mandamos (evita race com load)
      if (override) setSettings((s) => ({ ...s, ...override }));
      await load();
      return true;
    } catch (e) {
      toast.error((e as Error).message || 'Erro de rede ao salvar');
      return false;
    }
  }

  async function handleImageUpload(file: File, key: string) {
    if (!file) return;
    setUploading(key);

    const formData = new FormData();
    formData.append('file', file);
    // purpose no servidor: logo | favicon | banner | generic
    formData.append('purpose', key);
    formData.append('key', key);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.url) {
        // Atualiza estado e salva no banco na hora (logo/favicon não dependem do botão Salvar)
        const next = { ...settings, [key]: data.url };
        setSettings(next);
        const saveRes = await fetch('/api/admin/settings', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: data.url }),
        });
        if (saveRes.ok) {
          toast.success('Imagem enviada e salva. Atualize a página (Ctrl+F5) se o favicon não mudar.');
        } else {
          toast.success('Imagem enviada — clique em Salvar configurações');
        }
      } else {
        toast.error(data.error || 'Falha ao enviar imagem');
      }
    } catch {
      toast.error('Erro no upload');
    } finally {
      setUploading(null);
    }
  }

  /**
   * Taxas fixas: no banco = centavos (ex. 49 = R$ 0,49).
   * type=number exige ponto no value — NÃO usar toLocaleString('pt-BR') no value
   * (vírgula faz o input ficar vazio / não aceitar digitação).
   */
  const centsToNumberInput = (cents?: string) => {
    const n = parseInt(String(cents ?? '0'), 10);
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    return (safe / 100).toFixed(2); // "0.49"
  };
  const numberInputToCents = (reais: string) => {
    let s = String(reais || '').trim().replace(/[R$\s]/gi, '');
    // aceita 0,49 ou 0.49 ou 1.234,56
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < 0) return '0';
    return String(Math.round(n * 100));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'taxas', label: 'Taxas' },
    { id: 'regras', label: 'Regras' },
    { id: 'pagamentos', label: 'Meios de pagamento' },
    { id: 'gateways', label: 'Gateways' },
    { id: 'contato', label: 'Contato' },
    { id: 'visual', label: 'Identidade Visual' },
    { id: 'marketing', label: 'Marketing / Pixel' },
  ];

  const renderImageField = (label: string, key: string, note: string) => {
    const value = settings[key] || '';
    return (
      <div>
        <div className="label mb-1">{label}</div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="btn btn-secondary text-xs cursor-pointer flex items-center px-3 py-2">
              {uploading === key ? 'Enviando...' : 'Enviar arquivo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, key);
                  e.target.value = '';
                }}
              />
            </label>
            <input
              className="input flex-1 text-sm"
              placeholder="Ou cole a URL da imagem..."
              value={value}
              onChange={e => setSettings({ ...settings, [key]: e.target.value })}
            />
          </div>
          {value && (
            <div className="mt-1 p-2 border border-white/10 rounded-xl bg-zinc-950/80 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={label}
                className={
                  key === 'logo_url' || key === 'favicon_url'
                    ? 'h-12 w-auto max-w-[140px] object-contain bg-transparent'
                    : 'max-h-12 max-w-[160px] object-contain rounded'
                }
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <button 
                onClick={() => setSettings({ ...settings, [key]: '' })}
                className="text-xs text-red-400 hover:underline cursor-pointer"
              >
                Remover
              </button>
            </div>
          )}
        </div>
        <div className="text-[10px] text-zinc-500 mt-1">{note}</div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-zinc-400 mt-1">Gerencie o portal em seções organizadas. Imagens podem ser enviadas por arquivo ou URL.</p>
        </div>
        <button 
          onClick={() => void saveSettings()}
          className="btn btn-primary px-8"
        >
          Salvar todas as configurações
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 cursor-pointer ${
              activeTab === tab.id 
                ? 'border-emerald-500 text-white' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card p-6 lg:p-8">
        {/* === TAB: TAXAS === */}
        {activeTab === 'taxas' && (
          <section className="max-w-3xl">
            <div className="mb-5">
              <div className="font-semibold text-lg tracking-tight">Taxas de Gateway</div>
              <div className="text-xs text-zinc-500">Usadas no cálculo de líquido (bruto − taxa) nos relatórios e estornos.</div>
            </div>

            <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <div className="label">PIX — Percentual</div>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.pix_fee_percent ?? '1.99'}
                    onChange={(e) =>
                      setSettings({ ...settings, pix_fee_percent: e.target.value })
                    }
                  />
                  <span className="text-xs text-zinc-500 w-8">%</span>
                </div>
              </div>
              <div>
                <div className="label">PIX — Taxa fixa (R$)</div>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={centsToNumberInput(settings.pix_fee_fixed_cents)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        pix_fee_fixed_cents: numberInputToCents(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs text-zinc-500 w-8">R$</span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Use ponto: <strong className="text-zinc-400">0.00</strong> se não houver taxa fixa
                </p>
              </div>

              <div>
                <div className="label">Cartão — Percentual</div>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.card_fee_percent ?? '3.99'}
                    onChange={(e) =>
                      setSettings({ ...settings, card_fee_percent: e.target.value })
                    }
                  />
                  <span className="text-xs text-zinc-500 w-8">%</span>
                </div>
              </div>
              <div>
                <div className="label">Cartão — Taxa fixa (R$)</div>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={centsToNumberInput(settings.card_fee_fixed_cents)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        card_fee_fixed_cents: numberInputToCents(e.target.value),
                      })
                    }
                  />
                  <span className="text-xs text-zinc-500 w-8">R$</span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Stripe típico: digite <strong className="text-zinc-400">0.49</strong> (= R$ 0,49 /
                  49 centavos)
                </p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mt-4">
              Ex.: cartão 3,99% + R$ 0,49 → preencha percentual <code className="text-zinc-400">3.99</code>{' '}
              e fixa <code className="text-zinc-400">0.49</code>. No banco a fixa vira centavos (49).
            </p>
          </section>
        )}

        {/* === TAB: REGRAS === */}
        {activeTab === 'regras' && (
          <section className="max-w-3xl">
            <div className="mb-5">
              <div className="font-semibold text-lg tracking-tight">Regras Gerais</div>
              <div className="text-xs text-zinc-500">Configurações de e-mail, cancelamentos e comportamento do portal.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="label">E-mail remetente</div>
                <input className="input" placeholder="ingressos@lordenelson.com.br" value={settings.from_email || ''} onChange={e => setSettings({...settings, from_email: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                <div className="label">E-mail alerta de lote (quase esgotado)</div>
                <input
                  className="input"
                  type="email"
                  placeholder="ex: seu@email.com (avisos quando restam ≤2)"
                  value={settings.lote_alert_email || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, lote_alert_email: e.target.value })
                  }
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Dashboard mostra lotes com ≤5 restantes. E-mail automático ao chegar em ≤2.
                  Se vazio, usa o e-mail de contato do site.
                </p>
              </div>
              <div>
                <div className="label">Horas para cancelamento</div>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" value={settings.cancel_hours || 12} onChange={e => setSettings({...settings, cancel_hours: e.target.value})} />
                  <span className="text-xs text-zinc-500">horas</span>
                </div>
              </div>
              <div>
                <div className="label">Taxa de cancelamento</div>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" step="0.1" value={settings.cancel_fee || 10} onChange={e => setSettings({...settings, cancel_fee: e.target.value})} />
                  <span className="text-xs text-zinc-500">%</span>
                </div>
              </div>
              <div>
                <div className="label">Expirar pending (min)</div>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    type="number"
                    min={5}
                    value={settings.pending_order_ttl_minutes || '30'}
                    onChange={e => setSettings({ ...settings, pending_order_ttl_minutes: e.target.value })}
                  />
                  <span className="text-xs text-zinc-500">min</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mt-4">
              Cancelamentos são bloqueados após o prazo. A taxa é retida no reembolso.
              Pedidos pending (não pagos) são limpos automaticamente pelo cron a cada 15 min após o tempo acima (padrão 30 min), devolvendo o estoque.
            </p>
          </section>
        )}

        {/* === TAB: MEIOS DE PAGAMENTO (labels públicos + provider) === */}
        {activeTab === 'pagamentos' && (
          <section className="max-w-3xl space-y-6">
            <div>
              <div className="font-semibold text-lg tracking-tight">Meios de pagamento (checkout)</div>
              <div className="text-xs text-zinc-500 mt-1">
                Textos que o <strong className="text-zinc-300">cliente</strong> vê. O provedor (Mercado Pago / Stripe) é só
                técnico — chaves ficam em Gateways.
              </div>
            </div>

            {(['pix', 'card'] as const).map((id) => {
              const labelKey = `pay_${id}_label`;
              const hintKey = `pay_${id}_hint`;
              const enKey = `pay_${id}_enabled`;
              const provKey = `pay_${id}_provider`;
              const enabled = !['0', 'false', 'off'].includes(
                String(settings[enKey] ?? '1').toLowerCase()
              );
              return (
                <div key={id} className="rounded-2xl border border-white/10 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium capitalize">{id === 'pix' ? 'PIX' : 'Cartão'}</div>
                    <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            [enKey]: e.target.checked ? '1' : '0',
                          })
                        }
                      />
                      Ativo no checkout
                    </label>
                  </div>
                  <div>
                    <div className="label">Nome exibido</div>
                    <input
                      className="input"
                      placeholder={id === 'pix' ? 'PIX' : 'Cartão'}
                      value={settings[labelKey] || ''}
                      onChange={(e) => setSettings({ ...settings, [labelKey]: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="label">Texto de apoio (opcional)</div>
                    <input
                      className="input"
                      placeholder={id === 'pix' ? 'Aprovação na hora' : 'Crédito e débito'}
                      value={settings[hintKey] || ''}
                      onChange={(e) => setSettings({ ...settings, [hintKey]: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="label">Provedor (técnico)</div>
                    <select
                      className="input"
                      value={
                        settings[provKey] ||
                        (id === 'pix' ? 'mercadopago' : 'stripe')
                      }
                      onChange={(e) => setSettings({ ...settings, [provKey]: e.target.value })}
                    >
                      <option value="mercadopago">Mercado Pago</option>
                      <option value="stripe">Stripe</option>
                    </select>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Hoje PIX usa Mercado Pago e cartão usa Stripe na prática. Outras combinações
                      exigem implementação no gateway.
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* === TAB: CONTATO === */}
        {activeTab === 'contato' && (
          <section className="max-w-xl space-y-6">
            <div>
              <div className="font-semibold text-lg tracking-tight">Contato no site</div>
              <div className="text-xs text-zinc-500 mt-1">
                WhatsApp, e-mail do formulário /contato, Instagram. Aparecem no menu e rodapé.
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 p-4">
              <div className="text-sm font-medium text-zinc-300">WhatsApp</div>
              <div>
                <div className="label">Número exibido</div>
                <input
                  className="input"
                  placeholder="(82) 99647-1998"
                  value={settings.whatsapp_display || ''}
                  onChange={(e) => setSettings({ ...settings, whatsapp_display: e.target.value })}
                />
              </div>
              <div>
                <div className="label">Número para o link (só dígitos, com 55)</div>
                <input
                  className="input font-mono text-sm"
                  placeholder="5582996471998"
                  value={settings.whatsapp_e164 || ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsapp_e164: e.target.value.replace(/\D/g, ''),
                    })
                  }
                />
                <p className="text-[10px] text-zinc-500 mt-1">Gera wa.me — ex.: 55 + DDD + número.</p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 p-4">
              <div className="text-sm font-medium text-zinc-300">E-mail</div>
              <div>
                <div className="label">E-mail de contato (destino do formulário)</div>
                <input
                  className="input"
                  type="email"
                  placeholder="contato@lordenelson.com.br"
                  value={settings.contact_email || ''}
                  onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Mensagens de /contato chegam aqui via Resend. Deve ser domínio verificado no Resend
                  ou o mesmo FROM_EMAIL.
                </p>
              </div>
              <div>
                <div className="label">Texto de apoio (página Contato)</div>
                <textarea
                  className="input min-h-[72px]"
                  placeholder="Respondemos em horário comercial…"
                  value={settings.contact_note || ''}
                  onChange={(e) => setSettings({ ...settings, contact_note: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 p-4">
              <div className="text-sm font-medium text-zinc-300">Instagram (opcional)</div>
              <div>
                <div className="label">URL ou @usuário</div>
                <input
                  className="input"
                  placeholder="https://instagram.com/lordenelson ou @lordenelson"
                  value={settings.instagram_url || ''}
                  onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Vazio = ícone Instagram não aparece no site.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* === TAB: GATEWAYS === */}
        {activeTab === 'gateways' && (
          <section>
            <div className="mb-5">
              <div className="font-semibold text-lg tracking-tight">Gateways de Pagamento</div>
              <div className="text-xs text-zinc-500 mt-1">
                Chaves completas. <strong className="text-emerald-400">Configurações salvas aqui têm prioridade</strong> sobre .env.
              </div>
            </div>

            {/* Public URL - importante para webhooks MP e links */}
            <div className="mb-6 p-4 border border-emerald-900/40 bg-emerald-950/20 rounded-2xl">
              <div className="label mb-1">URL Pública do Site (para PIX / Webhooks / Emails)</div>
              <input 
                className="input font-mono text-xs w-full" 
                placeholder="https://seudominio.com   ou   https://abc123.ngrok.io" 
                value={settings.public_url || ''} 
                onChange={e => setSettings({...settings, public_url: e.target.value})} 
              />
              <div className="text-[10px] text-zinc-400 mt-1">
                Use isso com ngrok para testar chaves de produção do Mercado Pago. Deixe em branco para usar localhost (só funciona com chaves TEST-).
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Stripe */}
              <div className="border border-white/10 rounded-2xl p-5 bg-zinc-950/60">
                <div className="flex items-center gap-2 mb-4">
                  <div className="font-semibold">Stripe</div>
                  <span className="text-[10px] uppercase tracking-widest px-2 py-px rounded bg-white/5 text-zinc-400">Cartão</span>
                </div>
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="label">Publishable Key (pública)</div>
                    <input className="input font-mono text-xs" placeholder="pk_live_..." value={settings.stripe_publishable_key || ''} onChange={e => setSettings({...settings, stripe_publishable_key: e.target.value})} />
                    <div className="text-[10px] text-zinc-500 mt-0.5">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</div>
                  </div>
                  <div>
                    <div className="label">Secret Key (privada)</div>
                    <input className="input font-mono text-xs" type="password" placeholder="sk_live_..." value={settings.stripe_secret_key || ''} onChange={e => setSettings({...settings, stripe_secret_key: e.target.value})} />
                    <div className="text-[10px] text-zinc-500 mt-0.5">STRIPE_SECRET_KEY</div>
                  </div>
                  <div>
                    <div className="label">Webhook Signing Secret (whsec_…)</div>
                    <input
                      className="input font-mono text-xs"
                      type="password"
                      placeholder="whsec_..."
                      value={settings.stripe_webhook_secret || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, stripe_webhook_secret: e.target.value })
                      }
                    />
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret.
                      Também pode ir no env <code className="text-zinc-400">STRIPE_WEBHOOK_SECRET</code>.
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    <strong className="text-zinc-400">Modo recomendado: chaves diretas</strong> (pk_ + sk_ da
                    mesma conta e mesmo modo test/live). Valor mínimo BRL no Stripe: R$ 0,50.
                    Webhook produção:{' '}
                    <code className="text-zinc-400">https://portal.lordenelson.com.br/api/webhook/stripe</code>
                    {' '}
                    eventos: <code className="text-zinc-400">payment_intent.succeeded</code>,{' '}
                    <code className="text-zinc-400">charge.refunded</code>.
                  </p>

                  {/* Connect opcional — se account_id ficar sem token OAuth, o código ignora e usa sk_ */}
                  <div className="pt-3 border-t border-white/10">
                    <div className="label">Stripe Connect (opcional — não precisa)</div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      Só se usar OAuth. Com chaves diretas, deixe desconectado.
                    </div>
                    {settings.stripe_account_id ? (
                      <div className="text-amber-300 text-xs space-y-1">
                        <div>
                          Conta Connect salva: {settings.stripe_account_id}
                          {settings.stripe_access_token
                            ? ' (com token OAuth)'
                            : ' (sem token — cobranças usam a Secret Key)'}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              stripe_account_id: '',
                              stripe_access_token: '',
                              stripe_refresh_token: '',
                              stripe_client_id: '',
                            })
                          }
                          className="text-red-400 hover:underline"
                        >
                          Limpar Connect (usar só pk_/sk_)
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-zinc-600">Connect não configurado — ok para chaves.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mercado Pago */}
              <div className="border border-white/10 rounded-2xl p-5 bg-zinc-950/60">
                <div className="flex items-center gap-2 mb-4">
                  <div className="font-semibold">Mercado Pago</div>
                  <span className="text-[10px] uppercase tracking-widest px-2 py-px rounded bg-white/5 text-emerald-400">PIX recomendado</span>
                </div>
                <div className="text-[10px] text-amber-400 mb-3">Access Token é obrigatório para gerar QR Code PIX. Use TEST-... para localhost. Para chaves reais, configure a URL Pública acima + ngrok.</div>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="label">Public Key</div>
                      <input className="input font-mono text-xs" placeholder="APP_USR-..." value={settings.mercadopago_public_key || ''} onChange={e => setSettings({...settings, mercadopago_public_key: e.target.value})} />
                    </div>
                    <div>
                      <div className="label">Access Token (obrigatório para PIX)</div>
                      <input className="input font-mono text-xs" type="password" placeholder="TEST-... ou APP_USR-..." value={settings.mercadopago_access_token || ''} onChange={e => setSettings({...settings, mercadopago_access_token: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="label">Client ID</div>
                      <input className="input font-mono text-xs" placeholder="123456" value={settings.mercadopago_client_id || ''} onChange={e => setSettings({...settings, mercadopago_client_id: e.target.value})} />
                    </div>
                    <div>
                      <div className="label">Client Secret</div>
                      <input className="input font-mono text-xs" type="password" placeholder="..." value={settings.mercadopago_client_secret || ''} onChange={e => setSettings({...settings, mercadopago_client_secret: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-center text-zinc-500 mt-4">As chaves são usadas imediatamente em pagamentos, reembolsos e webhooks.</p>
          </section>
        )}

        {/* === TAB: IDENTIDADE VISUAL === */}
        {activeTab === 'visual' && (
          <section>
            <div className="mb-4">
              <div className="font-semibold text-lg tracking-tight">Identidade Visual</div>
              <div className="text-xs text-zinc-500">
                Marca, banner da home e rodapé em widgets (editor de texto avançado).
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {(
                [
                  { id: 'marca' as VisualSub, label: '1. Logo e marca' },
                  { id: 'banner' as VisualSub, label: '2. Banner home' },
                  { id: 'rodape' as VisualSub, label: '3. Rodapé' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setVisualSub(s.id)}
                  className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border transition ${
                    visualSub === s.id
                      ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {visualSub === 'marca' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
                {renderImageField(
                  'Logo do Site',
                  'logo_url',
                  'Aparece no topo do portal e opcionalmente no rodapé. PNG/SVG com fundo transparente.'
                )}
                {renderImageField(
                  'Favicon',
                  'favicon_url',
                  'Ícone da aba do navegador. PNG 32×32 ou 64×64. Após enviar: Ctrl+F5.'
                )}
                <div className="md:col-span-2">
                  <div className="label mb-1">Nome do Site</div>
                  <input
                    className="input max-w-md"
                    placeholder="Lorde Nelson"
                    value={settings.site_name || ''}
                    onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Usado em títulos, header, copyright e metadados.
                  </div>
                </div>
              </div>
            )}

            {visualSub === 'banner' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderImageField(
                  'Imagem do Banner',
                  'banner_image_url',
                  'Fundo do hero na home. Vazio = gradiente padrão.'
                )}
                <div className="space-y-4">
                  <div>
                    <div className="label mb-1">Título do Banner</div>
                    <input
                      className="input"
                      placeholder="LORDE NELSON"
                      value={settings.banner_title || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, banner_title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <div className="label mb-1">Subtítulo</div>
                    <textarea
                      className="input min-h-[90px]"
                      placeholder="Rest Pub • Shows, forró e grandes jogos..."
                      value={settings.banner_subtitle || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, banner_subtitle: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {visualSub === 'rodape' && (
              <FooterLayoutEditor
                settings={settings}
                onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                onSaveFooter={async (footerPayload) => {
                  // grava só chaves do rodapé (evita perder edição se estado geral estiver desatualizado)
                  const ok = await saveSettings(footerPayload);
                  return ok;
                }}
              />
            )}
          </section>
        )}

        {/* === TAB: MARKETING / PIXEL / SCRIPTS === */}
        {activeTab === 'marketing' && (
          <section className="max-w-3xl space-y-8">
            <div>
              <div className="font-semibold text-lg tracking-tight">Marketing · Pixel e scripts</div>
              <p className="text-xs text-zinc-500 mt-1">
                Meta Pixel, Google Analytics, Tag Manager e HTML livre no &lt;head&gt; ou no fim do
                body. Só administradores editam. Scripts customizados executam em todas as páginas
                públicas.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-white/20"
                checked={!['0', 'false', 'off'].includes(String(settings.tracking_enabled ?? '1').toLowerCase())}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tracking_enabled: e.target.checked ? '1' : '0',
                  })
                }
              />
              <span>
                <span className="text-sm font-medium text-zinc-200">Ativar tracking / pixels</span>
                <span className="block text-[11px] text-zinc-500 mt-0.5">
                  Desmarque para desligar tudo de uma vez (útil em testes).
                </span>
              </span>
            </label>

            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="text-sm font-medium text-zinc-300">Pixels prontos (só o ID)</div>

              <div>
                <div className="label mb-1">Meta / Facebook Pixel ID</div>
                <input
                  className="input font-mono text-sm"
                  placeholder="Ex: 123456789012345"
                  value={settings.meta_pixel_id || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, meta_pixel_id: e.target.value.replace(/\D/g, '').slice(0, 32) })
                  }
                  inputMode="numeric"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Events Manager → Pixel → ID (somente números). Injeta PageView automático.
                </p>
              </div>

              <div>
                <div className="label mb-1">Google Analytics 4 (Measurement ID)</div>
                <input
                  className="input font-mono text-sm"
                  placeholder="Ex: G-XXXXXXXXXX"
                  value={settings.google_analytics_id || ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      google_analytics_id: e.target.value.trim().toUpperCase().slice(0, 32),
                    })
                  }
                />
                <p className="text-[10px] text-zinc-500 mt-1">Formato G-… (também aceita AW-… / GT-…).</p>
              </div>

              <div>
                <div className="label mb-1">Google Tag Manager ID</div>
                <input
                  className="input font-mono text-sm"
                  placeholder="Ex: GTM-XXXXXXX"
                  value={settings.google_tag_manager_id || ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      google_tag_manager_id: e.target.value.trim().toUpperCase().slice(0, 24),
                    })
                  }
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Se usar GTM, em geral não precisa colar GA/Meta aqui — configure tags dentro do GTM.
                </p>
              </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="text-sm font-medium text-zinc-300">Scripts / HTML customizado</div>
              <p className="text-[11px] text-zinc-500">
                Cole o trecho completo (&lt;script&gt;…&lt;/script&gt;, noscript, etc.). Use com
                cuidado: código malicioso afeta o site inteiro.
              </p>

              <div>
                <div className="label mb-1">HTML / scripts no &lt;head&gt;</div>
                <textarea
                  className="input min-h-[140px] font-mono text-xs leading-relaxed"
                  placeholder={'<!-- Ex: verificação de domínio, outro pixel -->\n<script>...</script>'}
                  value={settings.head_scripts_html || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, head_scripts_html: e.target.value })
                  }
                  spellCheck={false}
                />
              </div>

              <div>
                <div className="label mb-1">HTML / scripts no fim do &lt;body&gt;</div>
                <textarea
                  className="input min-h-[140px] font-mono text-xs leading-relaxed"
                  placeholder={'<!-- Ex: chat, heatmap, outro snippet -->\n<script>...</script>'}
                  value={settings.body_scripts_html || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, body_scripts_html: e.target.value })
                  }
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-[11px] text-amber-200/90 space-y-1">
              <p className="font-medium text-amber-300">Dicas</p>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-200/80">
                <li>Salve e faça hard refresh (Ctrl+F5) no site público para testar.</li>
                <li>Meta Pixel Helper / Tag Assistant validam se o pixel disparou.</li>
                <li>Não cole secret keys ou tokens de API aqui — só códigos de tracking públicos.</li>
              </ul>
            </div>
          </section>
        )}

        <div className="pt-6 mt-8 border-t border-white/10 flex justify-end">
          <button type="button" onClick={() => void saveSettings()} className="btn btn-primary px-8">Salvar configurações</button>
        </div>
      </div>
    </div>
  );
}
