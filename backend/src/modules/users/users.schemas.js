import { z } from 'zod';
import { ROLES } from '../../config/permissions.js';
import { listQuery } from '../../validation/common.js';
import { PASSWORD_RULE } from '../auth/auth.schemas.js';

const roleCode = z.enum(Object.values(ROLES));
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(191);
const name = z.string().trim().min(2, 'Name is required').max(100);

export const listUsersQuery = listQuery(
  ['name', 'email', 'createdAt', 'lastLoginAt'],
  'name',
).extend({
  role: roleCode.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createUserSchema = z.object({
  name,
  email,
  roleCode,
  password: PASSWORD_RULE,
});

export const updateUserSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    roleCode: roleCode.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const resetPasswordSchema = z.object({ password: PASSWORD_RULE });
