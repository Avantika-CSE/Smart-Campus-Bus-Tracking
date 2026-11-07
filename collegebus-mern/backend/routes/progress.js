const express = require('express');
const Progress = require('../models/Progress');
const Bus = require('../models/Bus');
const Notification = require('../models/Notification');
const { resolveDriverBus, ensureProgress } = require('../utils/driverBus');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitProgressUpdate, emitNotification } = require('../sockets');

const router = express.Router();

// busId -> setInterval handle, so a running trip keeps advancing on the
// server even if nobody has the page open.
const activeTimers = new Map();

async function updateBusRecord(busId, status, location) {
  await Bus.updateOne({ busId }, { $set: { status, location } });
}

async function addNotification(forRole, title, desc, type) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const notif = await Notification.create({ forRole, title, desc, type, time });
  emitNotification(forRole, notif);
}

function tick(busId, routeName, stops) {
  const timer = setInterval(async () => {
    try {
      const progress = await ensureProgress(busId);
      if (progress.status !== 'running') { clearInterval(timer); activeTimers.delete(busId); return; }

      progress.stopIndex += 1;
      const bus = await Bus.findOne({ busId });
      const busNo = bus ? bus.no : busId;

      if (progress.stopIndex >= stops.length - 1) {
        progress.stopIndex = stops.length - 1;
        progress.status = 'completed';
        clearInterval(timer);
        activeTimers.delete(busId);
        await updateBusRecord(busId, 'On Time', stops[progress.stopIndex].name);
        await addNotification('admin', busNo + ' reached destination', routeName + ' - ' + busNo, 'success');
        await addNotification('student', 'Bus Arrived', routeName + ' bus has reached ' + stops[progress.stopIndex].name + '.', 'success');
      } else {
        await updateBusRecord(busId, 'On Time', stops[progress.stopIndex].name);
        await addNotification('student', 'Live Location Updated', routeName + ' bus is near ' + stops[progress.stopIndex].name + '.', 'info');
      }

      await progress.save();
      emitProgressUpdate(busId, { stopIndex: progress.stopIndex, status: progress.status });
    } catch (err) {
      console.error('Progress tick error for', busId, err.message);
    }
  }, 7000);
  activeTimers.set(busId, timer);
}

router.get('/:busId', requireAuth, async (req, res) => {
  const progress = await ensureProgress(req.params.busId);
  res.json({ progress });
});

// The signed-in driver's own bus (id, route, stops) - resolved/created
// server-side exactly like the original ensureDriverBus() did client-side.
router.get('/me/bus', requireAuth, requireRole('driver'), async (req, res) => {
  const { bus, route } = await resolveDriverBus(req.user.roll, req.user.name, req.user.phone);
  res.json({ bus, route });
});

router.post('/:busId/start', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const { bus } = await resolveDriverBus(req.user.roll, req.user.name, req.user.phone);
    if (bus.busId !== req.params.busId) return res.status(403).json({ message: 'You can only control your own assigned route.' });

    let progress = await ensureProgress(bus.busId);
    if (progress.status === 'running') return res.json({ progress });

    progress.stopIndex = 0;
    progress.status = 'running';
    await progress.save();

    await updateBusRecord(bus.busId, 'On Time', bus.stops[0].name);
    await addNotification('admin', bus.no + ' started from ' + bus.stops[0].name, bus.routeName + ' - ' + bus.no, 'info');
    await addNotification('student', 'Bus Started', bus.routeName + ' bus has started from ' + bus.stops[0].name + '.', 'info');

    emitProgressUpdate(bus.busId, { stopIndex: progress.stopIndex, status: progress.status });

    if (activeTimers.has(bus.busId)) clearInterval(activeTimers.get(bus.busId));
    tick(bus.busId, bus.routeName, bus.stops);

    res.json({ progress });
  } catch (err) {
    res.status(500).json({ message: 'Could not start route.', error: err.message });
  }
});

router.post('/:busId/end', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const { bus } = await resolveDriverBus(req.user.roll, req.user.name, req.user.phone);
    if (bus.busId !== req.params.busId) return res.status(403).json({ message: 'You can only control your own assigned route.' });

    if (activeTimers.has(bus.busId)) { clearInterval(activeTimers.get(bus.busId)); activeTimers.delete(bus.busId); }

    let progress = await ensureProgress(bus.busId);
    progress.stopIndex = 0;
    progress.status = 'idle';
    await progress.save();
    await updateBusRecord(bus.busId, 'On Time', bus.stops[0].name);

    emitProgressUpdate(bus.busId, { stopIndex: progress.stopIndex, status: progress.status });
    res.json({ progress });
  } catch (err) {
    res.status(500).json({ message: 'Could not end route.', error: err.message });
  }
});

module.exports = router;
