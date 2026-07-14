import { NextRequest, NextResponse } from 'next/server';
import { isStaffSession } from '@/lib/request-security';

/** Staff cookie ou CHECKIN_API_KEY */
export function assertCheckinStaff(req: NextRequest): true | NextResponse {
  const apiKeyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const apiKeyQuery =
    req.nextUrl.searchParams.get('key') || req.nextUrl.searchParams.get('api_key');
  const providedKey = apiKeyHeader || apiKeyQuery;
  const allowedApiKey = process.env.CHECKIN_API_KEY;

  const isStaff = isStaffSession(req);
  const isApiKeyValid = Boolean(allowedApiKey && providedKey === allowedApiKey);

  if (!isStaff && !isApiKeyValid) {
    return NextResponse.json(
      { error: 'Não autorizado. Use login de funcionário ou API key.' },
      { status: 401 }
    );
  }
  return true;
}

export function dayBoundsSaoPaulo(ref = new Date()): { start: Date; end: Date } {
  // Meia-noite local BR (UTC-3) aproximada — suficiente para listar “hoje”
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = fmt.format(ref); // YYYY-MM-DD
  // America/Sao_Paulo sem DST atual: UTC-3
  const start = new Date(`${day}T00:00:00-03:00`);
  const end = new Date(`${day}T23:59:59.999-03:00`);
  return { start, end };
}

export type EventCheckinStats = {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
};

export function emptyStats(): EventCheckinStats {
  return { total: 0, checkedIn: 0, notCheckedIn: 0 };
}
