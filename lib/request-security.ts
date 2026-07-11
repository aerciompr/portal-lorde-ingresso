import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, verifyAdminSessionCookie, verifyPassword } from '@/lib/auth';
import { cleanDigits } from '@/lib/masks';
import { prisma } from '@/lib/prisma';

/**
 * CSRF leve: exige Origin/Referer do mesmo host (mutações admin no browser).
 * Pedidos server-side sem Origin são rejeitados em production.
 */
export function assertSameOrigin(req: NextRequest): true | NextResponse {
  if (process.env.NODE_ENV !== 'production') return true;

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host') || '';

  const allowed = new Set<string>();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  try {
    const app = process.env.NEXT_PUBLIC_APP_URL;
    if (app) allowed.add(new URL(app).origin);
  } catch {
    /* ignore */
  }

  const check = (raw: string | null) => {
    if (!raw) return false;
    try {
      return allowed.has(new URL(raw).origin);
    } catch {
      return false;
    }
  };

  if (check(origin) || check(referer)) return true;

  return NextResponse.json(
    { error: 'Origem da requisição não permitida (CSRF).' },
    { status: 403 }
  );
}

/** Admin logado + same-origin (POST/PUT/DELETE admin). */
export async function requireAdminMutation(
  req: NextRequest
): Promise<true | NextResponse> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return assertSameOrigin(req);
}

/** Cookie de sessão staff (assinado) — check-in e proxy. */
export function isStaffSession(req: NextRequest): boolean {
  const session = req.cookies.get('admin_session')?.value;
  return verifyAdminSessionCookie(session);
}

/**
 * Prova que o caller é dono do pedido: accessCode LN ou senha do comprador.
 */
export async function assertOrderOwnership(params: {
  orderId: string;
  accessCode?: string | null;
  password?: string | null;
  email?: string | null;
  cpf?: string | null;
}): Promise<
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof loadOrder>>> }
  | { ok: false; response: NextResponse }
> {
  const order = await loadOrder(params.orderId);
  if (!order) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 }),
    };
  }

  const code = (params.accessCode || '').toUpperCase().trim();
  if (code && order.accessCode && code === order.accessCode.toUpperCase()) {
    return { ok: true, order };
  }

  const password = params.password || '';
  if (password && order.buyerPasswordHash) {
    const email = (params.email || '').toLowerCase().trim();
    const cpf = params.cpf ? cleanDigits(params.cpf) : '';
    const emailOk =
      !email ||
      !order.buyerEmail ||
      order.buyerEmail.toLowerCase().includes(email);
    const cpfOk =
      !cpf ||
      !order.buyerCpf ||
      cleanDigits(order.buyerCpf) === cpf;
    if (emailOk && cpfOk && (await verifyPassword(password, order.buyerPasswordHash))) {
      return { ok: true, order };
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          'Não autorizado. Informe o código LN-… da compra ou e-mail/CPF + senha.',
      },
      { status: 401 }
    ),
  };
}

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, cancellationRequests: true },
  });
}
