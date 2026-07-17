'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';
import StatusBadge from '@/components/StatusBadge';
import { formatCpf, formatPhone, formatCep } from '@/lib/masks';
import { ChevronDown, ChevronRight, Copy, Mail, Phone, Search, Users } from 'lucide-react';

interface RecentOrder {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  accessCode: string | null;
  eventTitle: string;
  ticketCount: number;
}

interface Customer {
  key: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  ordersCount: number;
  paidCount: number;
  refundedCount: number;
  pendingCount: number;
  cancelledCount: number;
  totalSpentCents: number;
  totalTickets: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  hasPassword: boolean;
  sources: string[];
  recentOrders: RecentOrder[];
}

interface Summary {
  totalCustomers: number;
  withPaidOrders: number;
  totalSpentCents: number;
  totalPaidOrders: number;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Maceio',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function addressLine(c: Customer) {
  const parts: string[] = [];
  if (c.street) {
    parts.push(c.number ? `${c.street}, ${c.number}` : c.street);
  }
  if (c.complement) parts.push(c.complement);
  if (c.neighborhood) parts.push(c.neighborhood);
  if (c.city || c.state) {
    parts.push([c.city, c.state].filter(Boolean).join(' / '));
  }
  if (c.zip) parts.push(formatCep(c.zip));
  return parts.length ? parts.join(' · ') : null;
}

export default function AdminClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [sort, setSort] = useState<'recent' | 'spent' | 'orders' | 'name'>('recent');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
      });
      if (qDebounced) params.set('q', qDebounced);
      const res = await fetch(`/api/admin/customers?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          toast.error('Sessão expirada — faça login de novo');
          return;
        }
        throw new Error('Falha ao carregar clientes');
      }
      const data = await res.json();
      setCustomers(data.customers || []);
      setSummary(data.summary || null);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [page, sort, qDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.message(value);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            Clientes
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Compradores agregados por e-mail/CPF a partir dos pedidos (portal e importados).
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Clientes</div>
          <div className="text-2xl font-semibold mt-1">{summary?.totalCustomers ?? '—'}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Com compra paga</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-400">
            {summary?.withPaidOrders ?? '—'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Pedidos pagos</div>
          <div className="text-2xl font-semibold mt-1">{summary?.totalPaidOrders ?? '—'}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Total gasto</div>
          <div className="text-2xl font-semibold mt-1">
            {summary != null ? formatPrice(summary.totalSpentCents) : '—'}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-9 w-full"
            placeholder="Buscar nome, e-mail, CPF, telefone, cidade, evento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input md:w-48"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="recent">Mais recentes</option>
          <option value="spent">Maior gasto</option>
          <option value="orders">Mais pedidos</option>
          <option value="name">Nome A–Z</option>
        </select>
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between text-sm text-zinc-400">
          <span>
            {loading ? 'Carregando…' : `${total} cliente${total === 1 ? '' : 's'}`}
            {qDebounced ? ` · filtro “${qDebounced}”` : ''}
          </span>
          {totalPages > 1 && (
            <span>
              Página {page} / {totalPages}
            </span>
          )}
        </div>

        {loading && customers.length === 0 ? (
          <div className="p-10 text-center text-zinc-500">Carregando clientes…</div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center text-zinc-500">Nenhum cliente encontrado.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {customers.map((c) => {
              const open = expanded === c.key;
              const addr = addressLine(c);
              return (
                <div key={c.key} className="hover:bg-white/[0.02]">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 flex gap-3 items-start"
                    onClick={() => setExpanded(open ? null : c.key)}
                  >
                    <span className="mt-1 text-zinc-500 shrink-0">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4">
                      <div className="lg:col-span-4 min-w-0">
                        <div className="font-medium text-white truncate">{c.name}</div>
                        <div className="text-xs text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 shrink-0" />
                          {c.email || '—'}
                        </div>
                        {c.phone && (
                          <div className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 shrink-0" />
                            {formatPhone(c.phone)}
                          </div>
                        )}
                      </div>
                      <div className="lg:col-span-2 text-xs text-zinc-400">
                        <div>CPF: {c.cpf ? formatCpf(c.cpf) : '—'}</div>
                        <div className="mt-0.5">
                          {c.city || c.state
                            ? [c.city, c.state].filter(Boolean).join(' / ')
                            : 'Sem cidade'}
                        </div>
                        {c.hasPassword && (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-900/40">
                            Conta com senha
                          </span>
                        )}
                      </div>
                      <div className="lg:col-span-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className="text-zinc-300">
                          <strong className="text-white">{c.paidCount}</strong> pagos
                        </span>
                        <span className="text-zinc-500">{c.ordersCount} pedidos</span>
                        <span className="text-zinc-500">{c.totalTickets} ing.</span>
                        {c.refundedCount > 0 && (
                          <span className="text-amber-400">{c.refundedCount} estorno(s)</span>
                        )}
                      </div>
                      <div className="lg:col-span-3 text-right lg:text-right">
                        <div className="font-semibold text-emerald-400">
                          {formatPrice(c.totalSpentCents)}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          Último: {fmtDate(c.lastOrderAt)}
                        </div>
                        {c.sources?.length > 0 && (
                          <div className="text-[10px] text-zinc-600 mt-0.5">
                            {c.sources.join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 pl-11 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-white/10 bg-zinc-950/50 p-3 space-y-1.5">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
                            Contato
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-300 break-all">{c.email || '—'}</span>
                            {c.email && (
                              <button
                                type="button"
                                className="text-zinc-500 hover:text-white shrink-0"
                                onClick={() => copyText('E-mail', c.email)}
                                title="Copiar e-mail"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="text-zinc-400">
                            Tel: {c.phone ? formatPhone(c.phone) : '—'}
                          </div>
                          <div className="text-zinc-400">
                            CPF: {c.cpf ? formatCpf(c.cpf) : '—'}
                          </div>
                          <div className="text-zinc-500 text-xs">
                            1º pedido: {fmtDate(c.firstOrderAt)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-zinc-950/50 p-3 space-y-1.5">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
                            Endereço (último pedido)
                          </div>
                          {addr ? (
                            <p className="text-zinc-300 text-sm leading-relaxed">{addr}</p>
                          ) : (
                            <p className="text-zinc-500 text-sm">Nenhum endereço cadastrado.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 bg-zinc-900/50 border-b border-white/5">
                          Pedidos recentes
                        </div>
                        <div className="divide-y divide-white/5">
                          {c.recentOrders.map((o) => (
                            <div
                              key={o.id}
                              className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{o.eventTitle}</div>
                                <div className="text-[11px] text-zinc-500">
                                  {fmtDate(o.paidAt || o.createdAt)}
                                  {o.accessCode ? ` · ${o.accessCode}` : ''}
                                  {` · ${o.ticketCount} ing.`}
                                  {` · #${o.id.slice(0, 8)}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <StatusBadge status={o.status} />
                                <span className="text-zinc-300 tabular-nums">
                                  {formatPrice(o.totalCents)}
                                </span>
                                <a
                                  href="/admin/pedidos"
                                  className="text-xs text-emerald-400 hover:underline"
                                  title="Ver em Pedidos"
                                >
                                  Pedidos
                                </a>
                              </div>
                            </div>
                          ))}
                          {c.ordersCount > c.recentOrders.length && (
                            <div className="px-3 py-2 text-xs text-zinc-500">
                              + {c.ordersCount - c.recentOrders.length} pedido(s) anterior(es) —
                              veja em Pedidos filtrando pelo e-mail.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-secondary text-sm disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="text-xs text-zinc-500">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary text-sm disabled:opacity-40"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
