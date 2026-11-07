const express = require('express');
const User = require('../models/User');
const DriverSetup = require('../models/DriverSetup');
const AdminSetup = require('../models/AdminSetup');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Progress = require('../models/Progress');
const Notification = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isValidDriverId } = require('../utils/constants');
const { isValidEmail, isValidPhone, normUid } = require('../utils/validators');
const { ensureProgress } = require('../utils/driverBus');
const { emitNotification } = require('../sockets');
const { enqueue } = require('../utils/geocode');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function nextDriverUid() {
  const all = await DriverSetup.find().select('driverUniqueId');
  let max = 200;
  all.forEach(d => {
    const m = String(d.driverUniqueId).match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'JIT-DRV-' + (max + 1);
}

function driverView(setup, bus, user) {
  return {
    uid: setup.driverUniqueId,
    name: setup.driverName,
    email: setup.driverEmail,
    phone: (user && user.phone) || (bus && bus.contact !== '-' ? bus.contact : '') || '',
    busNo: bus ? bus.no : '',
    routeName: bus ? bus.routeName : '',
    stops: bus ? bus.stops.map(s => s.name) : [],
    departure: bus ? bus.departure : ''
  };
}

// All drivers (admin-created ones and any older self-registered ones).
router.get('/', async (req, res) => {
  const setups = await DriverSetup.find().sort({ createdAt: 1 });
  const out = [];
  for (const s of setups) {
    const bus = await Bus.findOne({ driverId: s.driverUniqueId }).sort({ createdAt: 1 });
    const user = await User.findOne({ role: 'driver', roll: s.driverUniqueId });
    out.push(driverView(s, bus, user));
  }
  res.json({ drivers: out });
});

// Admin adds a driver + that driver's bus, route and stops in one go.
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const driverName = String(b.driverName || '').trim();
    const driverEmail = String(b.driverEmail || '').trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const busNo = String(b.busNo || '').trim();
    const routeName = String(b.routeName || '').trim();
    const departure = String(b.departure || '').trim() || '7:30 AM';
    const stopNames = String(b.stops || '').split(',').map(s => s.trim()).filter(Boolean);

    if (driverName.length < 3) return res.status(400).json({ message: "Enter the driver's full name (min 3 characters)." });
    if (!isValidEmail(driverEmail)) return res.status(400).json({ message: 'Enter a valid driver email.' });
    if (!isValidPhone(phone)) return res.status(400).json({ message: 'Enter a valid driver phone number.' });
    if (!busNo) return res.status(400).json({ message: 'Bus number is required.' });
    if (!routeName) return res.status(400).json({ message: 'Route name is required.' });
    if (stopNames.length < 2) return res.status(400).json({ message: 'Enter at least 2 stops (first = start, last = destination), separated by commas.' });

    let uid = normUid(b.driverUniqueId);
    if (uid) {
      if (!isValidDriverId(uid)) return res.status(400).json({ message: 'Driver Unique ID must look like JIT-DRV-206 (JIT-DRV- followed by a number of 201 or more).' });
    } else {
      uid = await nextDriverUid();
    }
    if (await DriverSetup.findOne({ driverUniqueId: uid })) return res.status(400).json({ message: 'This Driver Unique ID is already used.' });
    if (await Bus.findOne({ no: new RegExp('^' + escapeRe(busNo) + '$', 'i') })) return res.status(400).json({ message: 'A bus with this number already exists.' });

    const adminSetup = await AdminSetup.findOne({ adminUniqueId: req.user.roll });
    const stops = stopNames.map(n => ({ name: n, time: '' }));
    const first = stopNames[0];
    const last = stopNames[stopNames.length - 1];
    const slug = uid.replace(/[^A-Z0-9]/g, '');

    const setup = await DriverSetup.create({
      collegeName: adminSetup ? adminSetup.collegeName : '-',
      collegeAddress: adminSetup ? adminSetup.collegeAddress : '-',
      collegePin: adminSetup ? adminSetup.collegePin : '-',
      startingPoint: first, endingPoint: last,
      driverName, driverUniqueId: uid, driverEmail
    });
    const user = await User.create({ name: driverName, email: driverEmail, roll: uid, role: 'driver', phone });

    const route = await Route.create({
      routeId: 'RT_' + slug, name: routeName, title: first + ' to ' + last, stops,
      driverName, driverPhone: phone, busNo, startPoint: first, endPoint: last,
      departure, arrival: String(b.arrival || '').trim(),
      perf: { onTime: 85, delayed: 12, cancelled: 3 }, active: true, real: true
    });
    const bus = await Bus.create({
      busId: 'B_DRV_' + uid, no: busNo, routeId: route.routeId, routeName, routeDesc: first + ' to ' + last,
      driverId: uid, driverName, contact: phone, departure, arrival: route.arrival,
      status: 'On Time', location: first, stops, startLabel: first, destLabel: last
    });
    await ensureProgress(bus.busId);

    // Start finding map positions for these stops in the background.
    enqueue(stopNames);

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const notif = await Notification.create({ forRole: 'admin', title: 'New driver added', desc: driverName + ' (' + uid + ') - ' + routeName, type: 'success', time });
    emitNotification('admin', notif);

    res.status(201).json({ driver: driverView(setup, bus, user) });
  } catch (err) {
    res.status(500).json({ message: 'Could not add driver.', error: err.message });
  }
});

// Removes the driver together with their bus, route and live-tracking state.
router.delete('/:uid', async (req, res) => {
  try {
    const uid = normUid(req.params.uid);
    const buses = await Bus.find({ driverId: uid });
    for (const bus of buses) {
      await Progress.deleteOne({ busId: bus.busId });
      if (bus.routeId && bus.routeId.startsWith('RT_')) await Route.deleteOne({ routeId: bus.routeId });
      await Bus.deleteOne({ busId: bus.busId });
    }
    await DriverSetup.deleteOne({ driverUniqueId: uid });
    await User.deleteOne({ role: 'driver', roll: uid });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove driver.', error: err.message });
  }
});

module.exports = router;
