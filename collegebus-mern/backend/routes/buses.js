const express = require('express');
const Bus = require('../models/Bus');
const Notification = require('../models/Notification');
const { ROUTE_PATH } = require('../utils/constants');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitNotification } = require('../sockets');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const buses = await Bus.find().sort({ createdAt: 1 });
  res.json({ buses });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { no, routeName, departure, driverName, contact } = req.body;
    if (!no || !no.trim() || !routeName || !routeName.trim()) {
      return res.status(400).json({ message: 'Bus number and route name are required.' });
    }
    const existing = await Bus.findOne({ no: new RegExp('^' + no.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
    if (existing) return res.status(400).json({ message: 'A bus with this number already exists.' });

    const busId = 'B' + Date.now().toString(36).toUpperCase();
    const bus = await Bus.create({
      busId, no: no.trim(), routeId: '', routeName: routeName.trim(), routeDesc: routeName.trim(),
      driverId: '', driverName: (driverName || 'Unassigned').trim(), contact: (contact || '-').trim(),
      departure: (departure || '8:00 AM').trim(), status: 'On Time', location: 'College',
      stops: ROUTE_PATH.map(p => ({ name: p.name, time: '' }))
    });

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const notif = await Notification.create({ forRole: 'admin', title: 'New bus added', desc: bus.no + ' - ' + bus.routeName, type: 'success', time });
    emitNotification('admin', notif);

    res.status(201).json({ bus });
  } catch (err) {
    res.status(500).json({ message: 'Could not add bus.', error: err.message });
  }
});

router.delete('/:busId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.busId === 'B1') return res.status(400).json({ message: 'The demo Route 1 bus cannot be removed.' });
    await Bus.deleteOne({ busId: req.params.busId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove bus.', error: err.message });
  }
});

module.exports = router;
