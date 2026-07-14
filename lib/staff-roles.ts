/** Perfis de staff do portal */

export type StaffRole = 'superadmin' | 'admin' | 'checkin';

export const STAFF_ROLES: StaffRole[] = ['superadmin', 'admin', 'checkin'];

export function isStaffRole(r: string | null | undefined): r is StaffRole {
  return r === 'superadmin' || r === 'admin' || r === 'checkin';
}

/** Acesso ao painel /admin (não check-in) */
export function canAccessAdminPanel(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin';
}

/** Acesso ao check-in */
export function canAccessCheckin(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'checkin';
}

/** Criar/editar usuários staff */
export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin';
}

/** Configurações sensíveis (gateways, chaves) — só superadmin do .env */
export function canManageSettings(role: string | null | undefined): boolean {
  return role === 'superadmin';
}

export function roleLabel(role: string): string {
  if (role === 'superadmin') return 'Super admin (.env)';
  if (role === 'admin') return 'Administração';
  if (role === 'checkin') return 'Check-in';
  return role;
}
