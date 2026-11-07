const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitNotification } = require('../sockets');

const router = express.Router();

// Every notification comes back with `read: true/false` for the person asking.
// (Who else has read it is never sent to the browser.)
router.get('/', requireAuth, async (req, res) => {
  const forRole = req.query.role || req.user.role;
  const me = String(req.user._id);
  const docs = await Notification.find({ forRole }).sort({ createdAt: -1 }).limit(40);
  const notifications = docs.map(d => {
    const o = d.toObject();
    const read = (o.readBy || []).includes(me);
    delete o.readBy;
    o.read = read;
    return o;
  });
  res.json({ notifications, unread: notifications.filter(n => !n.read).length });
});

// Marks all of my role's notifications as read, for me only.
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const me = String(req.user._id);
    await Notification.updateMany({ forRole: req.user.role, readBy: { $ne: me } }, { $addToSet: { readBy: me } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not mark notifications as read.', error: err.message });
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role, title, desc } = req.body;
    if (!['student', 'driver', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid target role.' });
    if (!title || !title.trim() || !desc || !desc.trim()) return res.status(400).json({ message: 'Title and message are required.' });

    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const notif = await Notification.create({ forRole: role, title: title.trim(), desc: desc.trim(), type: 'purple', time });
    emitNotification(role, notif);

    res.status(201).json({ notification: notif });
  } catch (err) {
    res.status(500).json({ message: 'Could not send notification.', error: err.message });
  }
});

module.exports = router;
