import { PERMISSION_DEFINITIONS, ROLE_DEFINITIONS } from '../../config/permissions.js';

/**
 * Idempotently sync roles, permissions and the role→permission matrix from
 * src/config/permissions.js into the database. Safe to run on every deploy/seed.
 * Permissions no longer defined in config are removed (with their grants).
 */
export async function syncRolesAndPermissions(prisma) {
  await prisma.$transaction(async (tx) => {
    const roles = {};
    for (const def of ROLE_DEFINITIONS) {
      roles[def.code] = await tx.role.upsert({
        where: { code: def.code },
        update: { name: def.name, description: def.description },
        create: def,
      });
    }

    const codes = PERMISSION_DEFINITIONS.map((p) => p.code);
    await tx.permission.deleteMany({ where: { code: { notIn: codes } } });

    for (const def of PERMISSION_DEFINITIONS) {
      const perm = await tx.permission.upsert({
        where: { code: def.code },
        update: { module: def.module, description: def.description },
        create: { code: def.code, module: def.module, description: def.description },
      });
      const grantedRoleIds = def.roles.map((r) => roles[r].id);
      await tx.rolePermission.deleteMany({
        where: { permissionId: perm.id, roleId: { notIn: grantedRoleIds } },
      });
      for (const roleId of grantedRoleIds) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: perm.id } },
          update: {},
          create: { roleId, permissionId: perm.id },
        });
      }
    }
  });
}
