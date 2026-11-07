const express = require('express');
const Route = require('../models/Route');
const Notification = require('../models/Notification');
const { REAL_ROUTES } = require('../utils/constants');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitNotification } = require('../sockets');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const routes = await Route.find().sort({ createdAt: 1 });
  res.json({ routes });
});

// The 3 real JIT routes with full stop/driver data - used by the driver
// setup screen's Starting Point dropdown (needed BEFORE the driver has
// signed in, so this one is intentionally public - it's static reference
// data, not sensitive).
router.get('/real', async (req, res) => {
  // Real routes now live in the database (the 3 seeded JIT routes AND every
  // route an admin created together with a driver). Falls back to the
  // built-in list only if the database has none yet.
  const docs = await Route.find({ real: true }).sort({ createdAt: 1 });
  if (!docs.length) return res.json({ routes: REAL_ROUTES });
  res.json({
    routes: docs.map(r => ({
      id: r.routeId, name: r.name, title: r.title, busNo: r.busNo,
      driverName: r.driverName, driverPhone: r.driverPhone,
      startPoint: r.startPoint, endPoint: r.endPoint,
      departure: r.departure, arrival: r.arrival,
      stops: r.stops.map(s => ({ name: s.name, time: s.time }))
    }))
  });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, stops } = req.body;
    if (!name || !name.trim() || !stops || !String(stops).trim()) {
      return res.status(400).json({ message: 'Route name and stops are required.' });
    }
    const stopList = String(stops).split(',').map(s => ({ name: s.trim(), time: '' })).filter(s => s.name);
    const routeId = 'R' + Date.now().toString(36).toUpperCase();
    const route = await Route.create({
      routeId, name: name.trim(), stops: stopList,
      perf: { onTime: 85, delayed: 12, cancelled: 3 }, active: true
    });

    require('../utils/geocode').enqueue(stopList.map(s => s.name));

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const notif = await Notification.create({ forRole: 'admin', title: 'New route added', desc: route.name, type: 'success', time });
    emitNotification('admin', notif);

    res.status(201).json({ route });
  } catch (err) {
    res.status(500).json({ message: 'Could not add route.', error: err.message });
  }
});

router.delete('/:routeId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.routeId === 'R1') return res.status(400).json({ message: 'The demo Route 1 cannot be removed.' });
    await Route.deleteOne({ routeId: req.params.routeId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove route.', error: err.message });
  }
});

module.exports = router;
