import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { findPage } from '../../utils/pagination.js';

/** A user only ever sees and changes their own notifications. */
export function listNotifications(userId, { page, pageSize, unreadOnly }) {
  return findPage(prisma.notification, {
    where: { userId, ...(unreadOnly && { readAt: null }) },
    orderBy: { id: 'desc' },
    page,
    pageSize,
  });
}

export async function unreadCount(userId) {
  return { count: await prisma.notification.count({ where: { userId, readAt: null } }) };
}

export async function markRead(userId, id) {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (!count && !(await prisma.notification.findFirst({ where: { id, userId } }))) {
    throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }
  return prisma.notification.findUnique({ where: { id } });
}

export async function markAllRead(userId) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}
