import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Notification dispatch (spec §54). Business code describes an event and who should
 * hear about it (by permission, so recipients follow the RBAC matrix); channels decide
 * how it is delivered. Only the in-app channel exists today. Email, SMS and WhatsApp
 * adapters implement the same `send(recipients, notification)` and are added to
 * CHANNELS when those integrations are configured.
 *
 * Notifications never break the business operation that raised them: dispatch is
 * called after the transaction commits and failures are only logged.
 */

const inAppChannel = {
  name: 'in-app',
  async send(recipients, n) {
    if (!recipients.length) return 0;
    const { count } = await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        type: n.type,
        title: n.title.slice(0, 200),
        message: n.message.slice(0, 1000),
        link: n.link ?? null,
        entityType: n.entityType ?? null,
        entityId: n.entityId ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })),
      // (user, dedupeKey) is unique: the same alert is never repeated to a user.
      skipDuplicates: true,
    });
    return count;
  },
};

const CHANNELS = [inAppChannel];

async function resolveRecipients({ permission, userIds, excludeUserId }) {
  // Recipients = holders of the permission OR the named users.
  const who = [
    permission && { role: { permissions: { some: { permission: { code: permission } } } } },
    userIds?.some(Boolean) && { id: { in: userIds.filter(Boolean) } },
  ].filter(Boolean);
  if (!who.length) return [];
  const where = { status: 'ACTIVE', OR: who };
  const users = await prisma.user.findMany({ where, select: { id: true, email: true } });
  return users.filter((u) => u.id !== excludeUserId);
}

/**
 * @param {object} n
 * @param {string} [n.permission] deliver to every active user holding this permission
 * @param {number[]} [n.userIds] and to these users (e.g. whoever prepared the record)
 * @param {number} [n.excludeUserId] usually the actor, who already knows
 * @param {string} n.type  stable event code, e.g. SETTLEMENT_SUBMITTED
 * @param {string} n.title
 * @param {string} n.message
 * @param {string} [n.link] frontend path
 * @param {string} [n.dedupeKey] suppresses repeats of the same alert per user
 */
export async function notify(n) {
  try {
    const recipients = await resolveRecipients(n);
    let delivered = 0;
    for (const channel of CHANNELS) delivered += await channel.send(recipients, n);
    return delivered;
  } catch (err) {
    logger.warn({ err, type: n.type }, 'Notification dispatch failed');
    return 0;
  }
}
