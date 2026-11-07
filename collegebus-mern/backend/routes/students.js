const express = require('express');
const StudentRoute = require('../models/StudentRoute');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isValidPhone } = require('../utils/validators');
const { safeStudent } = require('./studentAuth');
const { emitNotification } = require('../sockets');

const router = express.Router();

// Student features (such as the saved route) open only after the profile is complete.
function requireProfile(req, res, next) {
  if (req.user.profileComplete !== true) return res.status(403).json({ message: 'Please complete your profile first.', profileIncomplete: true });
  next();
}

// The signed-in student's own record (used to know whether the profile is complete).
router.get('/me', requireAuth, requireRole('student'), (req, res) => {
  res.json({ user: safeStudent(req.user) });
});

// Complete (first time) or update the profile. Needs a verified e-mail.
router.put('/me/profile', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim().replace(/\s+/g, ' ');
    const roll = String((req.body && req.body.roll) || '').trim().replace(/\s+/g, '');
    const phone = String((req.body && req.body.phone) || '').trim();

    if (name.length < 3 || name.length > 80) return res.status(400).json({ field: 'name', message: 'Enter your full name (3 to 80 characters).' });
    if (roll.length < 3 || roll.length > 30 || !/^[A-Za-z0-9\-_/.]+$/.test(roll)) return res.status(400).json({ field: 'roll', message: 'Enter a valid roll number (letters, numbers and - _ / . only).' });
    if (!isValidPhone(phone)) return res.status(400).json({ field: 'phone', message: 'Enter a valid phone number.' });
    if (!req.user.emailVerified) return res.status(403).json({ message: 'Please verify your email first.' });

    const clash = await User.findOne({
      role: 'student', _id: { $ne: req.user._id },
      roll: new RegExp('^' + roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    });
    if (clash) return res.status(400).json({ field: 'roll', message: 'Another student is already registered with this roll number.' });

    const firstTime = req.user.profileComplete !== true;
    req.user.name = name; req.user.roll = roll; req.user.phone = phone;
    req.user.profileComplete = true;
    await req.user.save();

    if (firstTime) {
      const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const notif = await Notification.create({ forRole: 'admin', title: 'New student registered', desc: 'Roll No: ' + roll, type: 'purple', time });
      emitNotification('admin', notif);
    }
    res.json({ user: safeStudent(req.user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(400).json({ field: 'roll', message: 'Another student is already registered with this roll number.' });
    res.status(500).json({ message: 'Could not save your profile.', error: err.message });
  }
});

router.get('/me/route', requireAuth, requireRole('student'), requireProfile, async (req, res) => {
  const rec = await StudentRoute.findOne({ userId: req.user._id });
  res.json({ routeId: rec ? rec.routeId : null });
});

router.post('/me/route', requireAuth, requireRole('student'), requireProfile, async (req, res) => {
  try {
    const { routeId } = req.body;
    await StudentRoute.findOneAndUpdate(
      { userId: req.user._id },
      { routeId: routeId || null },
      { upsert: true, new: true }
    );
    res.json({ routeId: routeId || null });
  } catch (err) {
    res.status(500).json({ message: 'Could not save route selection.', error: err.message });
  }
});

module.exports = router;
