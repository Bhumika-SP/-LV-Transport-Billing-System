import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { dummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';

const USER_WITH_PERMISSIONS = {
  role: { include: { permissions: { include: { permission: true } } } },
};

/** Shape exposed to the client and attached to req.user. Never includes the hash. */
export function toSessionUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: { code: user.role.code, name: user.role.name },
    permissions: user.role.permissions.map((rp) => rp.permission.code).sort(),
    lastLoginAt: user.lastLoginAt,
  };
}

export function findUserForSession(userId) {
  return prisma.user.findUnique({ where: { id: userId }, include: USER_WITH_PERMISSIONS });
}

export async function login({ email, password }, req) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: USER_WITH_PERMISSIONS,
  });

  const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);

  if (!user || !valid) {
    await recordAudit(null, {
      userId: user?.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'User',
      entityId: user?.id,
      newValue: { email: email.toLowerCase() },
      req,
    });
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'ACTIVE') {
    await recordAudit(null, {
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'User',
      entityId: user.id,
      reason: 'Account inactive',
      req,
    });
    throw AppError.forbidden('This account has been deactivated', 'ACCOUNT_INACTIVE');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash) && { passwordHash: await hashPassword(password) }),
    },
    include: USER_WITH_PERMISSIONS,
  });

  await recordAudit(null, {
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    entityType: 'User',
    entityId: user.id,
    req,
  });

  return updated;
}

export async function logout(user, req) {
  await recordAudit(null, {
    userId: user.id,
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: 'User',
    entityId: user.id,
    req,
  });
}

/** Change own password. Invalidates other sessions by bumping tokenVersion. */
export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw AppError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });
    await recordAudit(tx, {
      userId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE,
      entityType: 'User',
      entityId: userId,
      req,
    });
    return updated;
  });
}
