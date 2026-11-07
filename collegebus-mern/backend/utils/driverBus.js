const Bus = require('../models/Bus');
const Progress = require('../models/Progress');
const DriverSetup = require('../models/DriverSetup');
const { REAL_ROUTES, ROUTE_PATH } = require('./constants');
const { normUid } = require('./validators');

async function ensureProgress(busId) {
  const existing = await Progress.findOne({ busId });
  if (existing) return existing;
  return Progress.create({ busId, stopIndex: 0, status: 'idle' });
}

/**
 * Every registered driver gets their own guaranteed bus record - never
 * shared with another driver - no matter how many drivers register or
 * whether their starting point matches one of the 3 real named routes.
 * This mirrors the frontend's original ensureDriverBus() but backed by
 * MongoDB, so there is no possibility of the stale/duplicate-record bugs
 * that localStorage's array bookkeeping used to cause.
 */
async function resolveDriverBus(uidRaw, name, phone) {
  const uid = normUid(uidRaw);

  // A bus that the admin (or an earlier login) already assigned to this
  // driver always wins - this is how admin-created drivers get exactly the
  // route and stops the admin typed in.
  const owned = await Bus.findOne({ driverId: uid }).sort({ createdAt: 1 });
  if (owned) {
    await ensureProgress(owned.busId);
    const ownedRoute = REAL_ROUTES.find(r => r.id === owned.routeId) || null;
    return { bus: owned, route: ownedRoute };
  }
  const setup = await DriverSetup.findOne({ driverUniqueId: uid });
  const route = setup ? REAL_ROUTES.find(r => r.startPoint === setup.startingPoint) : null;

  const canonicalId = route ? ('B_' + route.id) : null;
  const fallbackId = 'B_DRV_' + uid;
  const digits = (uid.match(/\d+/g) || ['0']).join('').slice(-4).padStart(4, '0');

  const driverName = name || (setup && setup.driverName) || uid;

  function buildDoc(busId, useRoute) {
    return {
      busId,
      no: useRoute ? useRoute.busNo : ('MH 31 DR ' + digits),
      routeId: useRoute ? useRoute.id : 'R1',
      routeName: useRoute ? useRoute.name : 'Route 1',
      routeDesc: useRoute ? useRoute.title : 'College - Civil Lines - Main Stop',
      driverId: uid,
      driverName,
      contact: phone || '-',
      departure: useRoute ? useRoute.departure : '8:00 AM',
      arrival: useRoute ? useRoute.arrival : '',
      status: 'On Time',
      location: useRoute ? useRoute.startPoint : 'College',
      stops: useRoute ? useRoute.stops : ROUTE_PATH.map(p => ({ name: p.name, time: '' })),
      startLabel: useRoute ? useRoute.startPoint : 'College',
      destLabel: useRoute ? (useRoute.endPoint + ' College') : 'Main Stop'
    };
  }

  let busId = fallbackId;
  let usedRoute = null;

  if (canonicalId) {
    let canonicalBus = await Bus.findOne({ busId: canonicalId });
    if (!canonicalBus) {
      canonicalBus = await Bus.create(buildDoc(canonicalId, route));
      busId = canonicalId;
      usedRoute = route;
    } else if (!canonicalBus.driverId || canonicalBus.driverId === uid) {
      // Unclaimed, or already ours - claim/refresh it.
      canonicalBus.driverId = uid;
      if (driverName) canonicalBus.driverName = driverName;
      if (phone) canonicalBus.contact = phone;
      await canonicalBus.save();
      busId = canonicalId;
      usedRoute = route;
    } else {
      // Someone else already owns the canonical bus for this route - this
      // driver gets their own separate bus so the two never collide.
      let fb = await Bus.findOne({ busId: fallbackId });
      if (!fb) fb = await Bus.create(buildDoc(fallbackId, route));
      busId = fallbackId;
      usedRoute = route;
    }
  } else {
    let fb = await Bus.findOne({ busId: fallbackId });
    if (!fb) fb = await Bus.create(buildDoc(fallbackId, null));
    else if (driverName && fb.driverName !== driverName) { fb.driverName = driverName; await fb.save(); }
    busId = fallbackId;
    usedRoute = null;
  }

  await ensureProgress(busId);
  const bus = await Bus.findOne({ busId });
  return { bus, route: usedRoute };
}

module.exports = { resolveDriverBus, ensureProgress };
