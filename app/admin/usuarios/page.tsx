'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserPlus, Shield, Trash2, Pencil } from 'lucide-react';

type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roleLabel: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [myRole, setMyRole] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'checkin' as 'admin' | 'checkin',
    active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.status === 403) {
        setForbidden(true);
        setUsers([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setUsers(data.users || []);
      setMyRole(data.myRole || '');
      setForbidden(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'checkin',
      active: true,
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(u: StaffUser) {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role === 'admin' ? 'admin' : 'checkin',
      active: u.active,
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim() || form.name.trim().length < 2) {
      toast.error('Informe o nome');
      return;
    }
    if (!editingId && !form.email.includes('@')) {
      toast.error('E-mail inválido');
      return;
    }
    if (!editingId && form.password.length < 6) {
      toast.error('Senha com no mínimo 6 caracteres');
      return;
    }
    if (editingId && form.password && form.password.length < 6) {
      toast.error('Nova senha: mín. 6 caracteres (ou deixe em branco)');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            name: form.name.trim(),
            role: form.role,
            active: form.active,
            ...(form.password ? { password: form.password } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
        toast.success('Usuário atualizado');
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            role: form.role,
            active: form.active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao criar');
        toast.success('Usuário criado');
      }
      resetForm();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(u: StaffUser) {
    if (!confirm(`Remover ${u.name} (${u.email})?`)) return;
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha');
      toast.success('Usuário removido');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (forbidden) {
    return (
      <div className="max-w-lg card p-8 text-center">
        <Shield className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">Acesso restrito</h1>
        <p className="text-sm text-zinc-400">
          Seu perfil não pode gerenciar usuários. Entre com o super admin do .env ou um usuário
          com perfil Administração.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            Usuários e perfis
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Cadastre equipe de <strong className="text-zinc-300">check-in</strong> ou{' '}
            <strong className="text-zinc-300">administração</strong>. O super admin do{' '}
            <code className="text-zinc-500">.env</code> continua válido.
          </p>
          {myRole && (
            <p className="text-[11px] text-zinc-600 mt-1">Seu perfil nesta sessão: {myRole}</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary text-sm inline-flex items-center gap-1.5"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <UserPlus className="w-4 h-4" />
          Novo usuário
        </button>
      </div>

      {/* Perfis explicados */}
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="card p-4 border border-sky-500/20">
          <div className="font-medium text-sky-300 mb-1">Check-in</div>
          <p className="text-xs text-zinc-500">
            Só app de check-in (ler QR, validar entrada). Não acessa o painel admin.
          </p>
        </div>
        <div className="card p-4 border border-emerald-500/20">
          <div className="font-medium text-emerald-300 mb-1">Administração</div>
          <p className="text-xs text-zinc-500">
            Painel completo (eventos, pedidos, importação, usuários). Check-in também liberado.
          </p>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-3">
          <div className="font-medium">
            {editingId ? 'Editar usuário' : 'Novo usuário'}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Nome</div>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <div className="label mb-1">E-mail (login)</div>
              <input
                className="input w-full"
                type="email"
                disabled={!!editingId}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="funcionario@email.com"
              />
            </div>
            <div>
              <div className="label mb-1">
                {editingId ? 'Nova senha (opcional)' : 'Senha'}
              </div>
              <input
                className="input w-full"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingId ? 'Deixe em branco para manter' : 'Mín. 6 caracteres'}
                autoComplete="new-password"
              />
            </div>
            <div>
              <div className="label mb-1">Perfil</div>
              <select
                className="input w-full"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as 'admin' | 'checkin' })
                }
              >
                <option value="checkin">Check-in (só validação)</option>
                <option value="admin">Administração</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Conta ativa
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Criar usuário'}
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm text-zinc-400">
          {loading ? 'Carregando…' : `${users.length} usuário(s)`}
        </div>
        {users.length === 0 && !loading ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Nenhum usuário cadastrado. Crie um perfil de check-in ou admin.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {users.map((u) => (
              <div
                key={u.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium flex flex-wrap items-center gap-2">
                    {u.name}
                    {!u.active && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        Inativo
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                        u.role === 'admin'
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/30'
                          : 'border-sky-500/30 text-sky-400 bg-sky-950/30'
                      }`}
                    >
                      {u.role === 'admin' ? 'Admin' : 'Check-in'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                  {u.lastLoginAt && (
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      Último login:{' '}
                      {new Date(u.lastLoginAt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs inline-flex items-center gap-1"
                    onClick={() => startEdit(u)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-950/30 inline-flex items-center gap-1"
                    onClick={() => removeUser(u)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-600">
        Super admin do ambiente: <code className="text-zinc-500">ADMIN_EMAIL</code> +{' '}
        <code className="text-zinc-500">ADMIN_PASSWORD</code> — não aparece nesta lista e tem
        acesso total.
      </p>
    </div>
  );
}
