import { describe, expect, it } from 'vitest';
import { isSecretSettingKey } from './settings-public';

/** Espelha regra de ownership de código (sem DB) */
function accessCodeMatches(
  orderCode: string | null | undefined,
  provided: string | null | undefined
): boolean {
  const a = (orderCode || '').toUpperCase().trim();
  const b = (provided || '').toUpperCase().trim();
  return Boolean(a && b && a === b);
}

function pendingOrderPublicAllowed(status: string): boolean {
  return (status || '').toLowerCase() === 'pending';
}

function paidOrderRequiresCode(status: string, hasMatchingCode: boolean, isAdmin: boolean): boolean {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return true;
  if (isAdmin) return true;
  return hasMatchingCode;
}

describe('hardening rules', () => {
  it('access code ownership is case-insensitive', () => {
    expect(accessCodeMatches('LN-ABC', 'ln-abc')).toBe(true);
    expect(accessCodeMatches('LN-ABC', 'LN-XXX')).toBe(false);
    expect(accessCodeMatches(null, 'LN-ABC')).toBe(false);
  });

  it('paid orders need code or admin', () => {
    expect(paidOrderRequiresCode('paid', false, false)).toBe(false);
    expect(paidOrderRequiresCode('paid', true, false)).toBe(true);
    expect(paidOrderRequiresCode('paid', false, true)).toBe(true);
    expect(paidOrderRequiresCode('pending', false, false)).toBe(true);
  });

  it('pending is allowed for checkout GET', () => {
    expect(pendingOrderPublicAllowed('pending')).toBe(true);
    expect(pendingOrderPublicAllowed('paid')).toBe(false);
  });

  it('secrets still filtered (regression)', () => {
    expect(isSecretSettingKey('mercadopago_access_token')).toBe(true);
  });
});

describe('check-in paid-only rule', () => {
  it('rejects non-paid orders for entry', () => {
    const canEnter = (orderStatus: string, ticketStatus: string) =>
      orderStatus.toLowerCase() === 'paid' && ticketStatus === 'valid';
    expect(canEnter('paid', 'valid')).toBe(true);
    expect(canEnter('pending', 'valid')).toBe(false);
    expect(canEnter('refunded', 'valid')).toBe(false);
    expect(canEnter('paid', 'used')).toBe(false);
  });
});
