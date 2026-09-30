import { PERMISSIONS as P } from '../../config/permissions.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { addDays, toDateString, parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { notify } from './notify.js';

const inr = (v) =>
  `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Business events that notify people (spec §54). Each is called by a controller after
 * the underlying operation has committed.
 */

async function settlementLabel(s) {
  const driver =
    s.driver ??
    (await prisma.driver.findUnique({ where: { id: s.driverId }, select: { fullName: true } }));
  return `${driver?.fullName ?? `Driver #${s.driverId}`} · ${s.settlementMonth}`;
}

export async function settlementEvent(kind, s, actor, reason) {
  const label = await settlementLabel(s);
  const base = {
    entityType: 'DriverSettlement',
    entityId: s.id,
    link: `/settlements/${s.id}`,
    excludeUserId: actor.id,
  };
  const events = {
    SUBMITTED: {
      permission: P.SETTLEMENT_APPROVE,
      title: 'Settlement awaiting approval',
      message: `${label} was submitted for review by ${actor.name}.`,
    },
    APPROVED: {
      permission: P.SETTLEMENT_FINALIZE,
      userIds: [s.submittedById],
      title: 'Settlement approved',
      message: `${label} was approved by ${actor.name} and can be finalized.`,
    },
    REJECTED: {
      userIds: [s.submittedById, s.calculatedById],
      title: 'Settlement returned for correction',
      message: `${label} was rejected by ${actor.name}: ${reason}`,
    },
    FINALIZED: {
      permission: P.PAYMENT_RECORD,
      title: 'Settlement ready for payment',
      message: `${label} was finalized; the driver can now be paid.`,
    },
    REOPENED: {
      permission: P.SETTLEMENT_PREPARE,
      title: 'Finalized settlement reopened',
      message: `${label} was reopened by ${actor.name}: ${reason}`,
    },
  };
  return notify({ ...base, ...events[kind], type: `SETTLEMENT_${kind}` });
}

export function importConfirmed(batch, actor) {
  return notify({
    permission: P.IMPORT_VIEW,
    excludeUserId: actor.id,
    type: 'IMPORT_COMPLETED',
    title: 'Trip import completed',
    message: `Import #${batch.id} (${batch.fileName}) created ${batch.importedRows ?? 0} trip(s).`,
    link: `/imports/${batch.id}`,
    entityType: 'TripImport',
    entityId: batch.id,
  });
}

export function importFailed(id, actor, message) {
  return notify({
    permission: P.TRIP_IMPORT,
    type: 'IMPORT_FAILED',
    title: 'Trip import failed',
    message: `Import #${id} failed and was rolled back (${actor.name}): ${message}`,
    link: `/imports/${id}`,
    entityType: 'TripImport',
    entityId: id,
  });
}

export function paymentReversed(payment, actor, reason) {
  return notify({
    permission: P.AUDIT_VIEW,
    excludeUserId: actor.id,
    type: 'PAYMENT_REVERSED',
    title: 'Driver payment reversed',
    message: `Payment #${payment.id} (${inr(payment.amount)}) was reversed by ${actor.name}: ${reason}`,
    link: `/settlements/${payment.settlementId}`,
    entityType: 'DriverPayment',
    entityId: payment.id,
  });
}

const EXPIRY_LABEL = {
  LICENSE: 'Driving licence',
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate',
  PERMIT: 'Permit',
};

/** Licence / insurance / fitness / permit expiring within 30 days (deduplicated per date). */
async function expiryAlerts(today) {
  const horizon = parseDateOnly(addDays(today, 30));
  const soon = { not: null, lte: horizon };
  const [drivers, vehicles] = await Promise.all([
    prisma.driver.findMany({
      where: { status: 'ACTIVE', licenseExpiryDate: soon },
      select: { id: true, fullName: true, licenseExpiryDate: true },
    }),
    prisma.vehicle.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { insuranceExpiryDate: soon },
          { fitnessExpiryDate: soon },
          { permitExpiryDate: soon },
        ],
      },
      select: {
        id: true,
        registrationNumber: true,
        insuranceExpiryDate: true,
        fitnessExpiryDate: true,
        permitExpiryDate: true,
      },
    }),
  ]);
  const items = [
    ...drivers.map((d) => ({
      kind: 'LICENSE',
      type: 'Driver',
      path: 'drivers',
      id: d.id,
      name: d.fullName,
      date: d.licenseExpiryDate,
    })),
    ...vehicles.flatMap((v) =>
      [
        ['INSURANCE', v.insuranceExpiryDate],
        ['FITNESS', v.fitnessExpiryDate],
        ['PERMIT', v.permitExpiryDate],
      ]
        .filter(([, date]) => date && date <= horizon)
        .map(([kind, date]) => ({
          kind,
          type: 'Vehicle',
          path: 'vehicles',
          id: v.id,
          name: v.registrationNumber,
          date,
        })),
    ),
  ];
  let sent = 0;
  for (const a of items) {
    const date = toDateString(a.date);
    const expired = date < today;
    sent += await notify({
      permission: P.MASTER_VIEW,
      type: 'DOCUMENT_EXPIRY',
      title: `${EXPIRY_LABEL[a.kind]} ${expired ? 'expired' : 'expiring soon'}`,
      message: `${a.name}: ${EXPIRY_LABEL[a.kind].toLowerCase()} ${expired ? 'expired' : 'expires'} on ${date}.`,
      link: `/${a.path}/${a.id}`,
      entityType: a.type,
      entityId: a.id,
      dedupeKey: `expiry:${a.kind}:${a.type}:${a.id}:${date}${expired ? ':expired' : ''}`,
    });
  }
  return sent;
}

/** Company settlements still pending for months that have ended. */
async function pendingCompanySettlements(today) {
  const month = today.slice(0, 7);
  const pending = await prisma.companySettlement.findMany({
    where: { status: 'PENDING', settlementMonth: { lt: month } },
    include: { company: { select: { name: true } } },
  });
  let sent = 0;
  for (const cs of pending) {
    sent += await notify({
      permission: P.COMPANY_SETTLEMENT_MANAGE,
      type: 'COMPANY_SETTLEMENT_PENDING',
      title: 'Company settlement still pending',
      message: `${cs.company.name} · ${cs.settlementMonth}: expected ${inr(cs.expectedAmount)} has not been marked received.`,
      link: '/company-settlements',
      entityType: 'CompanySettlement',
      entityId: cs.id,
      // One reminder per settlement per week.
      dedupeKey: `company-pending:${cs.id}:${Math.floor(Date.parse(today) / (7 * 86400000))}`,
    });
  }
  return sent;
}

/** Periodic checks (run on a timer and on demand by an Admin). */
export async function runScheduledChecks() {
  const today = todayInBusinessTz();
  const result = {
    expiry: await expiryAlerts(today),
    companyPending: await pendingCompanySettlements(today),
  };
  logger.info(result, 'Notification checks complete');
  return result;
}

let timer;
/** Start the background check loop (not in tests). Interval is in hours. */
export function startNotificationJobs(hours = 6) {
  const run = () =>
    runScheduledChecks().catch((err) => logger.warn({ err }, 'Notification checks failed'));
  setTimeout(run, 30_000).unref();
  timer = setInterval(run, hours * 3600_000);
  timer.unref();
}
