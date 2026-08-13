import { prisma } from '@/lib/prisma';

export type LoyaltyAuditAction =
  | 'plan_created'
  | 'plan_updated'
  | 'plan_deactivated'
  | 'cancellation_approved'
  | 'cancellation_rejected'
  | 'referral_bonus_updated'
  | 'checkin_recognized'
  | 'card_resent';

export type LoyaltyAuditEntityType =
  | 'LoyaltyPlan'
  | 'LoyaltyMembership'
  | 'LoyaltyCancellationRequest'
  | 'Setting';

/**
 * Grava entrada na trilha de auditoria do clube (não lança — nunca quebra a ação principal).
 */
export async function logLoyaltyAudit(params: {
  action: LoyaltyAuditAction | string;
  actor: string;
  entityType: LoyaltyAuditEntityType | string;
  entityId?: string | null;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.loyaltyAuditLog.create({
      data: {
        action: String(params.action).slice(0, 64),
        actor: String(params.actor || 'admin').slice(0, 191),
        entityType: String(params.entityType).slice(0, 32),
        entityId: params.entityId ? String(params.entityId).slice(0, 191) : null,
        detail: params.detail ? String(params.detail).slice(0, 4000) : null,
        meta: params.meta ? JSON.stringify(params.meta).slice(0, 4000) : null,
      },
    });
  } catch (e) {
    console.warn('[LOYALTY AUDIT]', params.action, (e as Error).message);
  }
}
