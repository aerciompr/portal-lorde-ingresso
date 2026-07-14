import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hashPassword } from '@/lib/auth';
import { requireAdminMutation } from '@/lib/request-security';
import { canManageUsers, roleLabel } from '@/lib/staff-roles';

function sanitize(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleLabel: roleLabel(u.role),
    active: u.active,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt,
  };
}

async function assertCanManage() {
  const s = await getSession();
  if (!s.ok || !canManageUsers(s.role)) {
    return NextResponse.json(
      { error: 'Sem permissão para gerenciar usuários' },
      { status: 403 }
    );
  }
  return null;
}

/** GET — lista staff users */
export async function GET() {
  const denied = await assertCanManage();
  if (denied) return denied;

  try {
    const users = await prisma.staffUser.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return NextResponse.json({
      users: users.map(sanitize),
      me: (await getSession()).email,
      myRole: (await getSession()).role,
    });
  } catch (e) {
    console.error('[admin/users GET]', e);
    return NextResponse.json(
      {
        error:
          'Tabela StaffUser ausente? Rode no MySQL: veja scripts/sql-add-staff-user.sql ou prisma db push',
      },
      { status: 500 }
    );
  }
}

/** POST — criar usuário */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  const denied = await assertCanManage();
  if (denied) return denied;

  let body: {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const email = String(body.email || '')
    .toLowerCase()
    .trim();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'checkin';

  if (!email.includes('@') || email.length > 180) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Senha com no mínimo 6 caracteres' },
      { status: 400 }
    );
  }

  const exists = await prisma.staffUser.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: 'Já existe usuário com este e-mail' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.staffUser.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      active: body.active !== false,
    },
  });

  return NextResponse.json({ ok: true, user: sanitize(user) });
}

/** PUT — atualizar usuário */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  const denied = await assertCanManage();
  if (denied) return denied;

  let body: {
    id?: string;
    name?: string;
    role?: string;
    active?: boolean;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) {
      return NextResponse.json({ error: 'Nome inválido' }, { status: 400 });
    }
    data.name = name;
  }
  if (body.role !== undefined) {
    data.role = body.role === 'admin' ? 'admin' : 'checkin';
  }
  if (body.active !== undefined) data.active = !!body.active;
  if (body.password !== undefined && String(body.password).length > 0) {
    if (String(body.password).length < 6) {
      return NextResponse.json({ error: 'Senha mín. 6 caracteres' }, { status: 400 });
    }
    data.passwordHash = await hashPassword(String(body.password));
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
  }

  try {
    const user = await prisma.staffUser.update({ where: { id }, data });
    return NextResponse.json({ ok: true, user: sanitize(user) });
  } catch {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }
}

/** DELETE — remover usuário */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;
  const denied = await assertCanManage();
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  try {
    await prisma.staffUser.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }
}
