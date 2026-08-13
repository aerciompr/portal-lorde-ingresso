import { prisma } from '@/lib/prisma';

const REFERRAL_BONUS_KEY = 'loyalty_referral_bonus_cents';
const DEFAULT_REFERRAL_BONUS_CENTS = 2000; // R$ 20,00

/** Crédito em centavos dado a quem indicou um novo sócio, aplicado na próxima fatura Stripe dele. */
export async function getLoyaltyReferralBonusCents(): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: REFERRAL_BONUS_KEY } });
    const n = row ? parseInt(row.value, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REFERRAL_BONUS_CENTS;
  } catch {
    return DEFAULT_REFERRAL_BONUS_CENTS;
  }
}

export async function setLoyaltyReferralBonusCents(cents: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: REFERRAL_BONUS_KEY },
    update: { value: String(cents) },
    create: { key: REFERRAL_BONUS_KEY, value: String(cents) },
  });
}
