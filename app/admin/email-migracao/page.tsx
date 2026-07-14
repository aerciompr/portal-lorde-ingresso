'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, Eye, Send, FlaskConical, Users } from 'lucide-react';

type Stats = {
  totalImportedPaid: number;
  pendingSend: number;
  alreadySent: number;
  events: { id: string; title: string; date: string }[];
  defaultIntro: string;
  sample: Array<{
    id: string;
    buyerName: string;
    buyerEmail: string;
    eventTitle: string;
    ticketCount: number;
    alreadySent: boolean;
  }>;
};

export default function AdminEmailMigracaoPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState('');
  const [introHtml, setIntroHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMeta, setPreviewMeta] = useState<{
    subject?: string;
    buyerEmail?: string;
    orderId?: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [batchLimit, setBatchLimit] = useState(15);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const q = eventId ? `?action=stats&eventId=${encodeURIComponent(eventId)}` : '?action=stats';
      const res = await fetch(`/api/admin/migration-email${q}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setStats(data);
      if (!introHtml && data.defaultIntro) setIntroHtml(data.defaultIntro);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function runPreview() {
    setBusy('preview');
    try {
      const res = await fetch('/api/admin/migration-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          eventId: eventId || undefined,
          introHtml,
          subject: subject || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no preview');
      setPreviewHtml(data.html || '');
      setPreviewMeta({
        subject: data.subject,
        buyerEmail: data.buyerEmail,
        orderId: data.orderId,
      });
      toast.success('Preview gerado — confira à direita');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!testEmail.includes('@')) {
      toast.error('Informe seu e-mail de teste');
      return;
    }
    setBusy('test');
    try {
      const res = await fetch('/api/admin/migration-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-test',
          eventId: eventId || undefined,
          orderId: previewMeta?.orderId,
          toEmail: testEmail.trim(),
          introHtml,
          subject: subject || undefined,
          attachPdf,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || 'Falha');
      toast.success(data.message || `Teste enviado para ${testEmail}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendBatch(dryRun: boolean) {
    if (!dryRun) {
      if (
        !confirm(
          `Enviar e-mail de migração para até ${batchLimit} clientes importados?\n\n` +
            (eventId ? 'Filtro: 1 evento\n' : 'Todos os eventos importados\n') +
            (attachPdf ? 'Com PDF em anexo\n' : 'Sem PDF\n') +
            '\nSó entram quem ainda não recebeu este e-mail.'
        )
      ) {
        return;
      }
    }
    setBusy(dryRun ? 'dry' : 'batch');
    try {
      const res = await fetch('/api/admin/migration-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-batch',
          eventId: eventId || undefined,
          introHtml,
          subject: subject || undefined,
          attachPdf,
          limit: batchLimit,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      if (dryRun) {
        toast.message(`Simulação: enviaria ${data.wouldSend} e-mail(s) · pendentes ${data.totalPending}`);
      } else {
        toast.success(data.message || `Enviados: ${data.sent}`);
        loadStats();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-emerald-400" />
          E-mail · migração de ingressos
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Avisa clientes dos pedidos importados (WooCommerce) sobre o novo portal, código de
          acesso e PDF. Valide o layout no preview antes de disparar em produção.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase">Importados pagos</div>
          <div className="text-2xl font-semibold mt-1">
            {loading ? '…' : stats?.totalImportedPaid ?? 0}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase">Ainda não enviados</div>
          <div className="text-2xl font-semibold mt-1 text-amber-400">
            {loading ? '…' : stats?.pendingSend ?? 0}
          </div>
        </div>
        <div className="card p-4 col-span-2 lg:col-span-1">
          <div className="text-[11px] text-zinc-500 uppercase">Já enviados</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-400">
            {loading ? '…' : stats?.alreadySent ?? 0}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config */}
        <div className="card p-5 space-y-4">
          <div className="font-medium text-zinc-200">Configuração e envio</div>

          <div>
            <div className="label mb-1">Filtrar por evento (opcional)</div>
            <select
              className="input w-full"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Todos os eventos importados</option>
              {(stats?.events || []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="label mb-1">Assunto (opcional)</div>
            <input
              className="input w-full"
              placeholder="Padrão: Seus ingressos no novo portal — {evento}"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <div className="label mb-1">Texto introdutório (HTML permitido)</div>
            <textarea
              className="input min-h-[160px] font-mono text-xs w-full"
              value={introHtml}
              onChange={(e) => setIntroHtml(e.target.value)}
              spellCheck={false}
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Use &lt;p&gt;, &lt;ul&gt;, &lt;strong&gt;. O restante do layout (evento, código, botão)
              é fixo.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
            />
            Anexar PDF do(s) ingresso(s)
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="btn btn-secondary text-sm inline-flex items-center gap-1.5"
              disabled={!!busy}
              onClick={runPreview}
            >
              <Eye className="w-4 h-4" />
              {busy === 'preview' ? 'Gerando…' : 'Pré-visualizar layout'}
            </button>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <FlaskConical className="w-4 h-4" /> Teste (só para você)
            </div>
            <input
              className="input w-full"
              type="email"
              placeholder="seu@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary text-sm w-full sm:w-auto"
              disabled={!!busy}
              onClick={sendTest}
            >
              {busy === 'test' ? 'Enviando teste…' : 'Enviar e-mail de teste'}
            </button>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Users className="w-4 h-4" /> Disparo em lote
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Até</span>
              <input
                className="input w-20"
                type="number"
                min={1}
                max={50}
                value={batchLimit}
                onChange={(e) => setBatchLimit(parseInt(e.target.value, 10) || 15)}
              />
              <span className="text-xs text-zinc-500">por vez (máx. 50)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!!busy}
                onClick={() => sendBatch(true)}
              >
                {busy === 'dry' ? '…' : 'Simular (não envia)'}
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm inline-flex items-center gap-1.5"
                disabled={!!busy || (stats?.pendingSend || 0) < 1}
                onClick={() => sendBatch(false)}
              >
                <Send className="w-4 h-4" />
                {busy === 'batch' ? 'Enviando…' : 'Enviar lote real'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Requer <code className="text-zinc-400">RESEND_API_KEY</code> e FROM_EMAIL no
              ambiente. Enviados ficam marcados e não repetem.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="card p-0 overflow-hidden flex flex-col min-h-[480px]">
          <div className="px-4 py-3 border-b border-white/10 bg-zinc-900/80">
            <div className="text-sm font-medium">Preview do e-mail</div>
            {previewMeta?.subject && (
              <div className="text-[11px] text-zinc-500 mt-1 truncate">
                Assunto: {previewMeta.subject}
              </div>
            )}
            {previewMeta?.buyerEmail && (
              <div className="text-[11px] text-zinc-600 truncate">
                Modelo: {previewMeta.buyerEmail}
              </div>
            )}
          </div>
          <div className="flex-1 bg-zinc-950 p-2 sm:p-4 overflow-auto">
            {previewHtml ? (
              <iframe
                title="Preview e-mail migração"
                srcDoc={previewHtml}
                className="w-full min-h-[520px] rounded-lg border border-white/10 bg-black"
                sandbox=""
              />
            ) : (
              <div className="h-full min-h-[320px] flex items-center justify-center text-sm text-zinc-500 text-center px-6">
                Clique em <strong className="text-zinc-300 mx-1">Pré-visualizar layout</strong> para
                validar o HTML com um pedido real importado.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sample list */}
      {stats?.sample && stats.sample.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-sm text-zinc-400">
            Amostra de destinatários
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 border-b border-white/5">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th>Evento</th>
                  <th>Ing.</th>
                  <th>Status e-mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.sample.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3">
                      <div className="font-medium">{o.buyerName}</div>
                      <div className="text-xs text-zinc-500">{o.buyerEmail}</div>
                    </td>
                    <td className="text-zinc-400 max-w-[200px] truncate">{o.eventTitle}</td>
                    <td>{o.ticketCount}</td>
                    <td>
                      {o.alreadySent ? (
                        <span className="text-emerald-400 text-xs">Enviado</span>
                      ) : (
                        <span className="text-amber-400 text-xs">Pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
