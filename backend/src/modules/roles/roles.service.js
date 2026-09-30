import { prisma } from '../../lib/prisma.js';

/** Roles with their granted permission codes, plus the full permission catalogue. */
export async function listRolesWithPermissions() {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        permissions: { select: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }),
  ]);

  return {
    roles: roles.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.code),
    })),
    permissions: permissions.map(({ code, module, description }) => ({
      code,
      module,
      description,
    })),
  };
}
