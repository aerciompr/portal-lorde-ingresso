'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Tab = 'taxas' | 'regras' | 'gateways' | 'visual';

export default function AdminConfiguracoes() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>('visual');
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/settings');
    if (res.ok) setSettings(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSettings() {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    toast.success('Configurações salvas no banco');
    load();
  }

  async function handleImageUpload(file: File, key: string) {
    if (!file) return;
    setUploading(key);

    const formData = new FormData();
    formData.append('file', file);

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

  // Helpers para exibir taxas fixas em Reais (mas salvar como centavos) — padrão BR
  const toReais = (cents?: string) =>
    ((parseInt(cents || '0') || 0) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const fromReais = (reais: string) => {
    let s = String(reais || '').trim().replace(/[R$\s]/gi, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return String(Math.round((parseFloat(s) || 0) * 100));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'taxas', label: 'Taxas' },
    { id: 'regras', label: 'Regras' },
    { id: 'gateways', label: 'Gateways' },
    { id: 'visual', label: 'Identidade Visual' },
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
            <div className="mt-1 p-2 border border-white/10 rounded bg-zinc-950 flex items-center gap-3">
              <img 
                src={value} 
                alt={label} 
                className="max-h-12 max-w-[160px] object-contain rounded" 
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
          onClick={saveSettings} 
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
                  <input className="input" type="number" step="0.01" value={settings.pix_fee_percent || '1.99'} onChange={e => setSettings({...settings, pix_fee_percent: e.target.value})} />
                  <span className="text-xs text-zinc-500 w-8">%</span>
                </div>
              </div>
              <div>
                <div className="label">PIX — Taxa fixa (R$)</div>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" step="0.01" value={toReais(settings.pix_fee_fixed_cents)} onChange={e => setSettings({...settings, pix_fee_fixed_cents: fromReais(e.target.value)})} />
                  <span className="text-xs text-zinc-500 w-8">R$</span>
                </div>
              </div>

              <div>
                <div className="label">Cartão — Percentual</div>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" step="0.01" value={settings.card_fee_percent || '3.99'} onChange={e => setSettings({...settings, card_fee_percent: e.target.value})} />
                  <span className="text-xs text-zinc-500 w-8">%</span>
                </div>
              </div>
              <div>
                <div className="label">Cartão — Taxa fixa (R$)</div>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" step="0.01" value={toReais(settings.card_fee_fixed_cents)} onChange={e => setSettings({...settings, card_fee_fixed_cents: fromReais(e.target.value)})} />
                  <span className="text-xs text-zinc-500 w-8">R$</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mt-4">Ex: 1.99% + R$ 0,00 no PIX. Os valores são convertidos automaticamente para centavos no banco.</p>
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

                  {/* Stripe Connect (OAuth) */}
                  <div className="pt-3 border-t border-white/10">
                    <div className="label">Stripe Connect (Login OAuth - recomendado)</div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      Conecte via login na sua conta Stripe para descobrir meios de pagamento disponíveis (cartão, boleto etc) sem expor chaves secretas.
                    </div>
                    <input className="input font-mono text-xs mb-2" placeholder="ca_... (Client ID do Connect)" value={settings.stripe_client_id || ''} onChange={e => setSettings({...settings, stripe_client_id: e.target.value})} />
                    
                    {settings.stripe_account_id ? (
                      <div className="text-emerald-400 text-xs">
                        ✓ Conectado: {settings.stripe_account_id}
                        <br />
                        <span className="text-[10px] text-zinc-400">Meios de pagamento: configure no dashboard Stripe da conta (Payment methods). O checkout usará automatic_payment_methods.</span>
                        <button 
                          onClick={() => setSettings({...settings, stripe_account_id: '', stripe_access_token: '', stripe_refresh_token: ''})} 
                          className="ml-2 text-red-400 hover:underline"
                        >
                          Desconectar
                        </button>
                      </div>
                    ) : (
                      <a 
                        href="/api/stripe/connect/authorize" 
                        className="btn btn-secondary text-xs px-4 py-1.5"
                        target="_self"
                      >
                        Conectar conta Stripe (OAuth)
                      </a>
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

        {/* === TAB: IDENTIDADE VISUAL (com uploads) === */}
        {activeTab === 'visual' && (
          <section>
            <div className="mb-6">
              <div className="font-semibold text-lg tracking-tight">Identidade Visual</div>
              <div className="text-xs text-zinc-500">Envie arquivos de imagem ou cole URLs. As imagens são salvas no servidor.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
              {renderImageField(
                'Logo do Site', 
                'logo_url', 
                'Aparece no topo do portal. Recomendado PNG ou SVG com fundo transparente.'
              )}

              {renderImageField(
                'Favicon',
                'favicon_url',
                'Ícone da aba do navegador. PNG quadrado (32×32 ou 64×64) ou .ico. Após enviar, use Ctrl+F5 (cache do browser).'
              )}

              <div className="md:col-span-2">
                <div className="label mb-1">Nome do Site</div>
                <input className="input max-w-md" placeholder="Lorde Nelson" value={settings.site_name || ''} onChange={e => setSettings({...settings, site_name: e.target.value})} />
                <div className="text-[10px] text-zinc-500 mt-1">Usado em títulos, header e metadados.</div>
              </div>

              <div className="md:col-span-2 border-t border-white/10 pt-6 mt-2">
                <div className="font-medium text-emerald-400 mb-4">Banner Principal da Home</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {renderImageField(
                    'Imagem do Banner', 
                    'banner_image_url', 
                    'Imagem grande de fundo no hero da página inicial. Deixe vazio para usar o gradiente padrão.'
                  )}

                  <div className="space-y-4">
                    <div>
                      <div className="label mb-1">Título do Banner</div>
                      <input className="input" placeholder="LORDE NELSON" value={settings.banner_title || ''} onChange={e => setSettings({...settings, banner_title: e.target.value})} />
                    </div>
                    <div>
                      <div className="label mb-1">Subtítulo / Texto (suporta HTML)</div>
                      <textarea className="input min-h-[90px]" placeholder="Rest Pub • Shows, forró e grandes jogos..." value={settings.banner_subtitle || ''} onChange={e => setSettings({...settings, banner_subtitle: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 border-t border-white/10 pt-6 mt-2">
                <div className="font-medium text-emerald-400 mb-4">Rodapé</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <div className="label mb-1">Texto esquerdo (suporta HTML)</div>
                    <textarea className="input min-h-[90px]" value={settings.footer_left || ''} onChange={e => setSettings({...settings, footer_left: e.target.value})} />
                  </div>
                  <div>
                    <div className="label mb-1">Texto direito (suporta HTML)</div>
                    <textarea className="input min-h-[90px]" value={settings.footer_right || ''} onChange={e => setSettings({...settings, footer_right: e.target.value})} />
                    <div className="text-[10px] text-zinc-500 mt-1">Use {"{year}"} para inserir o ano atual automaticamente.</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="pt-6 mt-8 border-t border-white/10 flex justify-end">
          <button onClick={saveSettings} className="btn btn-primary px-8">Salvar configurações</button>
        </div>
      </div>
    </div>
  );
}
