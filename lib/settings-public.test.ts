import { describe, expect, it } from 'vitest';
import {
  filterPublicSettings,
  isSecretSettingKey,
  sanitizeOrderForClient,
} from './settings-public';

describe('settings-public', () => {
  it('marca secrets corretamente', () => {
    expect(isSecretSettingKey('mercadopago_access_token')).toBe(true);
    expect(isSecretSettingKey('stripe_secret_key')).toBe(true);
    expect(isSecretSettingKey('STRIPE_SECRET_KEY')).toBe(true);
    expect(isSecretSettingKey('logo_url')).toBe(false);
    expect(isSecretSettingKey('mercadopago_public_key')).toBe(false);
  });

  it('filterPublicSettings remove tokens e mantém branding', () => {
    const raw = {
      logo_url: '/uploads/logo.png',
      site_name: 'Lorde Nelson',
      mercadopago_public_key: 'APP_USR-pub',
      mercadopago_access_token: 'APP_USR-SECRET',
      stripe_secret_key: 'sk_live_xxx',
      stripe_publishable_key: 'pk_live_xxx',
      random_unknown: 'x',
    };
    const pub = filterPublicSettings(raw);
    expect(pub.logo_url).toBe('/uploads/logo.png');
    expect(pub.site_name).toBe('Lorde Nelson');
    expect(pub.mercadopago_public_key).toBe('APP_USR-pub');
    expect(pub.stripe_publishable_key).toBe('pk_live_xxx');
    expect(pub.mercadopago_access_token).toBeUndefined();
    expect(pub.stripe_secret_key).toBeUndefined();
    expect(pub.random_unknown).toBeUndefined();
  });

  it('sanitizeOrderForClient remove hash e expõe hasPassword', () => {
    const o = sanitizeOrderForClient({
      id: '1',
      buyerName: 'A',
      buyerPasswordHash: '$2a$10$hash',
    });
    expect((o as { buyerPasswordHash?: string }).buyerPasswordHash).toBeUndefined();
    expect((o as { hasPassword?: boolean }).hasPassword).toBe(true);
  });
});
