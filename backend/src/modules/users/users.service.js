import { ROLES } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { findPage } from '../../utils/pagination.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';

/** Public user shape; the password hash and token version never leave the service. */
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { code: true, name: true } },
};

async function getRoleId(tx, code) {
  const role = await tx.role.findUnique({ where: { code } });
  if (!role) throw AppError.badRequest(`Unknown role ${code}`, 'INVALID_ROLE');
  return role.id;
}

async function assertEmailFree(tx, email, exceptId) {
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('A user with this email already exists', 'EMAIL_TAKEN');
  }
}

export function listUsers({ page, pageSize, search, sortBy, sortDir, role, status }) {
  const where = {
    ...(status && { status }),
    ...(role && { role: { code: role } }),
    ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] }),
  };
  return findPage(prisma.user, {
    where,
    select: USER_SELECT,
    orderBy: { [sortBy]: sortDir },
    page,
    pageSize,
  });
}

export async function getUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  return user;
}

export async function createUser(data, actor, req) {
  return prisma.$transaction(async (tx) => {
    await assertEmailFree(tx, data.email);
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        roleId: await getRoleId(tx, data.roleCode),
        createdById: actor.id,
      },
      select: USER_SELECT,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'User',
      entityId: user.id,
      newValue: user,
      req,
    });
    return user;
  });
}

/**
 * Update profile, role or status.
 * Guards against lock-out: an admin cannot demote/deactivate themselves, and the
 * last active admin cannot be demoted or deactivated.
 */
export async function updateUser(id, data, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!before) throw AppError.notFound('User not found', 'USER_NOT_FOUND');

    const roleChanging = data.roleCode && data.roleCode !== before.role.code;
    const deactivating = data.status === 'INACTIVE' && before.status === 'ACTIVE';

    if (id === actor.id && (roleChanging || deactivating)) {
      throw AppError.badRequest(
        'You cannot change your own role or deactivate yourself',
        'SELF_MODIFICATION_NOT_ALLOWED',
      );
    }
    if (before.role.code === ROLES.ADMIN && (roleChanging || deactivating)) {
      const activeAdmins = await tx.user.count({
        where: { status: 'ACTIVE', role: { code: ROLES.ADMIN } },
      });
      if (activeAdmins <= 1) {
        throw AppError.badRequest('At least one active admin must remain', 'LAST_ADMIN');
      }
    }
    if (data.email) await assertEmailFree(tx, data.email, id);

    const after = await tx.user.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email }),
        ...(data.status && { status: data.status }),
        ...(roleChanging && { roleId: await getRoleId(tx, data.roleCode) }),
        // Deactivation revokes all sessions immediately.
        ...(deactivating && { tokenVersion: { increment: 1 } }),
      },
      select: USER_SELECT,
    });

    const action = roleChanging
      ? AUDIT_ACTIONS.ROLE_CHANGE
      : data.status && data.status !== before.status
        ? AUDIT_ACTIONS.STATUS_CHANGE
        : AUDIT_ACTIONS.UPDATE;
    await recordAudit(tx, {
      userId: actor.id,
      action,
      entityType: 'User',
      entityId: id,
      previousValue: before,
      newValue: after,
      req,
    });
    return after;
  });
}

/** Admin sets a new password; all of that user's sessions are revoked. */
export async function resetPassword(id, { password }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    await tx.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entityType: 'User',
      entityId: id,
      req,
    });
  });
}
