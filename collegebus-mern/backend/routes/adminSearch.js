const express = require('express');
const User = require('../models/User');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const { requireAuth, requireRole } = require('../middleware/auth');

/* ============ Admin search ============
   GET /api/admin/search?q=ram                 -> a few results from every category
   GET /api/admin/search?q=ram&type=students&page=2  -> more results of one category
   Admin only. Searches real database records, with limits (never everything).        */

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const TYPES = ['students', 'drivers', 'buses', 'routes'];
const PER_TYPE_ALL = 5;      // results per category in the combined search
const PER_PAGE_ONE = 10;     // results per page when one category is opened
const MAX_QUERY = 60;
const MAX_PAGE = 50;

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const isPending = roll => /^PENDING-/.test(roll || '');

function cleanQuery(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchStudents(rx, skip, limit) {
  const filter = { role: 'student', $or: [{ name: rx }, { email: rx }, { roll: rx }, { phone: rx }] };
  const [docs, total] = await Promise.all([
    User.find(filter).select('name email roll phone profileComplete').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return {
    total,
    items: docs.map(u => ({
      id: String(u._id), name: u.name, email: u.email,
      roll: isPending(u.roll) ? '' : u.roll, phone: u.phone || '',
      profilePending: u.profileComplete === false || isPending(u.roll),
      section: 'users', key: 'user:' + u._id
    }))
  };
}

async function searchDrivers(rx, skip, limit) {
  // a driver also matches when the driver's bus number or route matches
  const viaBus = await Bus.find({ driverId: { $ne: '' }, $or: [{ no: rx }, { routeName: rx }] }).select('driverId').limit(200).lean();
  const idsViaBus = viaBus.map(b => b.driverId);
  const filter = { role: 'driver', $or: [{ name: rx }, { email: rx }, { roll: rx }, { phone: rx }, { roll: { $in: idsViaBus } }] };
  const [docs, total] = await Promise.all([
    User.find(filter).select('name email roll phone').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  const buses = docs.length ? await Bus.find({ driverId: { $in: docs.map(d => d.roll) } }).select('driverId no routeName').lean() : [];
  const busOf = {}; buses.forEach(b => { if (!busOf[b.driverId]) busOf[b.driverId] = b; });
  return {
    total,
    items: docs.map(d => ({
      id: String(d._id), name: d.name, uid: d.roll, email: d.email, phone: d.phone || '',
      busNo: (busOf[d.roll] && busOf[d.roll].no) || '', routeName: (busOf[d.roll] && busOf[d.roll].routeName) || '',
      section: 'drivers', key: 'driver:' + d.roll
    }))
  };
}

async function searchBuses(rx, skip, limit) {
  const filter = { $or: [{ no: rx }, { routeName: rx }, { routeDesc: rx }, { driverName: rx }, { driverId: rx }, { contact: rx }, { busId: rx }] };
  const [docs, total] = await Promise.all([
    Bus.find(filter).select('busId no routeName driverName status location').sort({ no: 1 }).skip(skip).limit(limit).lean(),
    Bus.countDocuments(filter)
  ]);
  return {
    total,
    items: docs.map(b => ({
      id: b.busId, busNo: b.no, routeName: b.routeName, driverName: b.driverName, status: b.status, location: b.location,
      section: 'buses', key: 'bus:' + b.busId
    }))
  };
}

async function searchRoutes(rx, skip, limit) {
  const filter = { $or: [{ name: rx }, { title: rx }, { busNo: rx }, { driverName: rx }, { startPoint: rx }, { endPoint: rx }, { 'stops.name': rx }] };
  const [docs, total] = await Promise.all([
    Route.find(filter).select('routeId name title busNo driverName active stops').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Route.countDocuments(filter)
  ]);
  return {
    total,
    items: docs.map(r => ({
      id: r.routeId, name: r.name, title: r.title || '', busNo: r.busNo || '', driverName: r.driverName || '',
      stops: (r.stops || []).length, active: r.active !== false,
      section: 'routes', key: 'route:' + r.routeId
    }))
  };
}

const RUNNERS = { students: searchStudents, drivers: searchDrivers, buses: searchBuses, routes: searchRoutes };

router.get('/', async (req, res) => {
  try {
    const q = cleanQuery(req.query.q);
    if (q.length < 2) return res.status(400).json({ message: 'Type at least 2 characters to search.' });
    if (q.length > MAX_QUERY) return res.status(400).json({ message: 'Search text is too long (max ' + MAX_QUERY + ' characters).' });

    const type = req.query.type === undefined ? null : String(req.query.type);
    if (type !== null && !TYPES.includes(type)) return res.status(400).json({ message: 'Unknown search type.' });
    const page = Math.max(1, Math.min(MAX_PAGE, parseInt(req.query.page, 10) || 1));

    const rx = new RegExp(escapeRegex(q), 'i');   // plain text only: the admin can never inject a regex or a query operator

    if (type) {
      const r = await RUNNERS[type](rx, (page - 1) * PER_PAGE_ONE, PER_PAGE_ONE);
      return res.json({ query: q, type, page, perPage: PER_PAGE_ONE, results: { [type]: r } });
    }
    const out = await Promise.all(TYPES.map(t => RUNNERS[t](rx, 0, PER_TYPE_ALL)));
    const results = {}; TYPES.forEach((t, i) => { results[t] = out[i]; });
    res.json({ query: q, perType: PER_TYPE_ALL, totalAll: out.reduce((n, r) => n + r.total, 0), results });
  } catch (err) {
    console.error('Admin search failed:', err.message);
    res.status(500).json({ message: 'Search failed. Please try again.' });
  }
});

module.exports = router;
