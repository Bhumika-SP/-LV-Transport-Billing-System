import { monthOf, parseDateOnly, toDateString, todayInBusinessTz } from '../../utils/dates.js';
import { normalizeRegistration } from '../../validation/fields.js';
import { resolveRate } from '../rates/rates.service.js';
import { calculateTripEarnings, resolveKm } from '../trips/trip-calculations.js';
import { TARGET_FIELDS, cleanNumber, cleanText, parseImportDate } from './import-fields.js';

/**
 * Validate and normalize import rows (spec §40–41). Pure w.r.t. writes: reads reference
 * data, never modifies anything. Reused at preview time and again at confirm time.
 *
 * Each result: { rowNumber, raw, status, messages[], normalized|null }
 *   status: ERROR > DUPLICATE > WARNING > VALID
 */

const driverKey = {
  CODE: (s) => s.toUpperCase(),
  LICENSE: (s) => s.toUpperCase().replace(/[\s-]/g, ''),
  PHONE: (s) => s.replace(/\D/g, '').slice(-10),
  NAME: (s) => s.toLowerCase().replace(/\s+/g, ' '),
};
const driverSource = {
  CODE: 'driverCode',
  LICENSE: 'licenseNumber',
  PHONE: 'phone',
  NAME: 'fullName',
};

function buildDriverIndex(drivers, matchField) {
  const index = new Map();
  for (const d of drivers) {
    const value = d[driverSource[matchField]];
    if (!value) continue;
    const key = driverKey[matchField](value);
    index.set(key, index.has(key) ? 'AMBIGUOUS' : d);
  }
  return index;
}

const isActiveOn = (a, date) => a.startDate <= date && (!a.endDate || a.endDate >= date);

/** Duplicate-key value for a normalized row or an existing trip. */
function keyOf(fields, v) {
  return JSON.stringify(
    fields.map((f) => {
      const x = v[f];
      if (x === null || x === undefined) return null;
      return typeof x === 'string' ? x.trim().toLowerCase() : String(x);
    }),
  );
}

function tripToKeySource(t) {
  return {
    externalTripId: t.externalTripId,
    tripReference: t.tripReference,
    tripDate: toDateString(t.tripDate),
    vehicle: t.vehicleId,
    driver: t.driverId,
    startKm: t.startKm?.toFixed(2) ?? null,
    totalKm: t.totalKm.toFixed(2),
  };
}

export async function validateImportRows(db, { companyId, template, rows }) {
  const col = template.mappings; // { targetField: sourceColumn }
  const get = (row, field) => (col[field] ? row.values[col[field]] : undefined);
  const today = todayInBusinessTz();

  // ---- Reference data, loaded once per file --------------------------------------
  const [drivers, vehicles] = await Promise.all([
    db.driver.findMany(),
    db.vehicle.findMany({ include: { vehicleType: true } }),
  ]);
  const driverIndex = buildDriverIndex(drivers, template.driverMatchField);
  const vehicleIndex = new Map(vehicles.map((v) => [v.registrationNumber, v]));

  const [vehicleAssignments, driverAssignments] = await Promise.all([
    db.vehicleAssignment.findMany({ where: { companyId } }),
    db.driverAssignment.findMany(),
  ]);

  const rateCache = new Map();
  const rateFor = async (vehicleTypeId, date) => {
    const k = `${vehicleTypeId}|${date}`;
    if (!rateCache.has(k)) rateCache.set(k, await resolveRate(vehicleTypeId, date, db));
    return rateCache.get(k);
  };

  // ---- Pass 1: per-row normalization and validation ------------------------------
  const results = [];
  for (const row of rows) {
    const messages = [];
    const error = (field, message) => messages.push({ level: 'error', field, message });
    const warn = (message) => messages.push({ level: 'warning', message });

    const driverText = cleanText(get(row, 'driver'));
    const vehicleText = cleanText(get(row, 'vehicle'));
    const dateRaw = get(row, 'tripDate');

    let driver = null;
    if (!driverText) error('driver', 'Missing driver');
    else {
      const found = driverIndex.get(driverKey[template.driverMatchField](driverText));
      if (!found) error('driver', `Unknown driver "${driverText}"`);
      else if (found === 'AMBIGUOUS')
        error('driver', `More than one driver matches "${driverText}"`);
      else driver = found;
    }

    let vehicle = null;
    if (!vehicleText) error('vehicle', 'Missing vehicle');
    else {
      vehicle = vehicleIndex.get(normalizeRegistration(vehicleText)) ?? null;
      if (!vehicle) error('vehicle', `Unknown vehicle "${vehicleText}"`);
    }

    let tripDate = null;
    if (dateRaw === null || dateRaw === undefined || dateRaw === '')
      error('tripDate', 'Missing trip date');
    else {
      tripDate = parseImportDate(dateRaw, template.dateFormat);
      if (!tripDate)
        error('tripDate', `Invalid date "${cleanText(dateRaw)}" (expected ${template.dateFormat})`);
      else if (tripDate > today) error('tripDate', `Trip date ${tripDate} is in the future`);
    }

    const km = resolveKm({
      kmSource: template.kmMode,
      startKm: cleanNumber(get(row, 'startKm')),
      endKm: cleanNumber(get(row, 'endKm')),
      totalKm: cleanNumber(get(row, 'totalKm')),
    });
    if (!km.ok) km.errors.forEach((e) => error(e.path, e.message));

    const text = (field, max) => {
      const v = cleanText(get(row, field));
      if (v && v.length > max) {
        error(field, `${TARGET_FIELDS[field].label} is longer than ${max} characters`);
        return null;
      }
      return v;
    };
    const externalTripId = text('externalTripId', 100);
    const tripReference = text('tripReference', 100);
    const pickup = text('pickup', 255);
    const dropLocation = text('dropLocation', 255);
    const notes = text('notes', 2000);

    let rate = null;
    if (vehicle && tripDate && tripDate <= today) {
      rate = await rateFor(vehicle.vehicleTypeId, tripDate);
      if (!rate)
        error('tripDate', `No ${vehicle.vehicleType.name} rate is effective on ${tripDate}`);
    }

    if (driver && driver.status !== 'ACTIVE') warn(`Driver ${driver.fullName} is inactive`);
    if (vehicle && vehicle.status !== 'ACTIVE')
      warn(`Vehicle ${vehicle.registrationNumber} is inactive`);
    if (vehicle && tripDate) {
      const d = parseDateOnly(tripDate);
      if (!vehicleAssignments.some((a) => a.vehicleId === vehicle.id && isActiveOn(a, d))) {
        warn(
          `Vehicle ${vehicle.registrationNumber} is not assigned to this company on ${tripDate}`,
        );
      }
      if (
        driver &&
        !driverAssignments.some(
          (a) => a.driverId === driver.id && a.vehicleId === vehicle.id && isActiveOn(a, d),
        )
      ) {
        warn(
          `Driver ${driver.fullName} is not assigned to ${vehicle.registrationNumber} on ${tripDate}`,
        );
      }
    }

    const hasError = messages.some((m) => m.level === 'error');
    const extra = template.keepUnmapped
      ? Object.fromEntries(
          Object.entries(row.values)
            .filter(
              ([h, v]) => !Object.values(col).includes(h) && v !== null && String(v).trim() !== '',
            )
            .map(([h, v]) => [h, v instanceof Date ? v.toISOString().slice(0, 10) : String(v)]),
        )
      : {};

    results.push({
      rowNumber: row.rowNumber,
      raw: Object.fromEntries(
        Object.entries(row.values).map(([h, v]) => [
          h,
          v instanceof Date ? v.toISOString().slice(0, 10) : v,
        ]),
      ),
      messages,
      normalized: hasError
        ? null
        : {
            companyId,
            driverId: driver.id,
            vehicleId: vehicle.id,
            vehicleTypeId: vehicle.vehicleTypeId,
            tripDate,
            settlementMonth: monthOf(tripDate),
            externalTripId,
            tripReference,
            pickup,
            dropLocation,
            notes,
            kmSource: km.km.kmSource,
            startKm: km.km.startKm?.toFixed(2) ?? null,
            endKm: km.km.endKm?.toFixed(2) ?? null,
            totalKm: km.km.totalKm.toFixed(2),
            rateId: rate.id,
            ratePerKm: rate.ratePerKm.toFixed(2),
            earnings: calculateTripEarnings(km.km.totalKm, rate.ratePerKm).toFixed(2),
            extra: Object.keys(extra).length ? extra : null,
          },
    });
  }

  // ---- Pass 2: duplicate detection (configurable key, spec §41) ------------------
  const keyFields = template.duplicateKey;
  const valid = results.filter((r) => r.normalized);
  const keySource = (n) => ({
    ...n,
    vehicle: n.vehicleId,
    driver: n.driverId,
  });

  if (valid.length) {
    const dates = valid.map((r) => r.normalized.tripDate).sort();
    const externalIds = valid.map((r) => r.normalized.externalTripId).filter(Boolean);
    const existing = await db.trip.findMany({
      where: {
        companyId,
        OR: [
          {
            status: 'ACTIVE',
            tripDate: { gte: parseDateOnly(dates[0]), lte: parseDateOnly(dates.at(-1)) },
          },
          ...(externalIds.length ? [{ externalTripId: { in: externalIds } }] : []),
        ],
      },
    });

    const existingByKey = new Map();
    const existingByExternalId = new Map();
    for (const t of existing) {
      if (t.status === 'ACTIVE') existingByKey.set(keyOf(keyFields, tripToKeySource(t)), t);
      if (t.externalTripId) existingByExternalId.set(t.externalTripId.toLowerCase(), t);
    }

    const seenKey = new Map();
    const seenExternal = new Map();
    for (const r of valid) {
      const n = r.normalized;
      const dup = (message) => r.messages.push({ level: 'duplicate', message });
      const incomplete = keyFields.some((f) => {
        const v = keySource(n)[f];
        return f === 'externalTripId' && (v === null || v === undefined);
      });

      // External trip IDs are unique per company in the database regardless of the key.
      const ext = n.externalTripId?.toLowerCase();
      if (ext && existingByExternalId.has(ext)) {
        const t = existingByExternalId.get(ext);
        dup(
          `External trip ID "${n.externalTripId}" already exists (trip #${t.id}${t.status === 'CANCELLED' ? ', cancelled' : ''})`,
        );
      } else if (ext && seenExternal.has(ext)) {
        dup(`External trip ID "${n.externalTripId}" repeats row ${seenExternal.get(ext)}`);
      } else if (incomplete) {
        r.messages.push({
          level: 'warning',
          message: 'No external trip ID: duplicate check skipped for this row',
        });
      } else {
        const key = keyOf(keyFields, keySource(n));
        if (existingByKey.has(key))
          dup(`Matches existing trip #${existingByKey.get(key).id} (${keyFields.join(' + ')})`);
        else if (seenKey.has(key)) dup(`Same ${keyFields.join(' + ')} as row ${seenKey.get(key)}`);
        else seenKey.set(key, r.rowNumber);
      }
      if (ext && !seenExternal.has(ext)) seenExternal.set(ext, r.rowNumber);
    }
  }

  for (const r of results) {
    const levels = new Set(r.messages.map((m) => m.level));
    r.status = levels.has('error')
      ? 'ERROR'
      : levels.has('duplicate')
        ? 'DUPLICATE'
        : levels.has('warning')
          ? 'WARNING'
          : 'VALID';
  }
  return results;
}
