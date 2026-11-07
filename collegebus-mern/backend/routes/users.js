const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const DriverSetup = require('../models/DriverSetup');
const AdminSetup = require('../models/AdminSetup');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Progress = require('../models/Progress');
const StudentRoute = require('../models/StudentRoute');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function safeUser(user) {
  return { id: user._id, name: user.name, email: user.email, roll: user.roll, role: user.role, phone: user.phone, dept: user.dept, profileComplete: user.role === 'student' ? user.profileComplete === true : true };
}

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: 1 });
  res.json({ users: users.map(u => ({ id: u._id, name: u.name, email: u.email, roll: /^PENDING-/.test(u.roll || '') ? '' : u.roll, role: u.role, phone: u.phone, dept: u.dept, profileComplete: u.role === 'student' ? u.profileComplete === true : true })) });
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (name && name.trim()) req.user.name = name.trim();
    if (phone !== undefined) req.user.phone = phone.trim();
    await req.user.save();
    res.json({ user: safeUser(req.user) });
  } catch (err) {
    res.status(500).json({ message: 'Could not update profile.', error: err.message });
  }
});

router.put('/me/password', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Students sign in with an email OTP, so there is no password to change.' });
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters.' });

    // Admin/Driver accounts don't authenticate with a password at all (they
    // sign in with Name + Unique ID + Email), so they start with no password
    // hash set. In that case any first attempt just needs an empty current
    // field, matching how this optional field always behaved for them.
    const hasExistingPassword = !!req.user.password;
    const match = hasExistingPassword
      ? await bcrypt.compare(currentPassword || '', req.user.password)
      : !currentPassword;
    if (!match) return res.status(400).json({ message: 'Current password is incorrect.' });

    req.user.password = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not change password.', error: err.message });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ message: "You can't remove your own account." });
    }
    const target = await User.findById(req.params.id);
    if (target && target.role === 'driver') {
      const uid = String(target.roll).toUpperCase();
      const buses = await Bus.find({ driverId: uid });
      for (const bus of buses) {
        await Progress.deleteOne({ busId: bus.busId });
        if (bus.routeId && bus.routeId.startsWith('RT_')) await Route.deleteOne({ routeId: bus.routeId });
        await Bus.deleteOne({ busId: bus.busId });
      }
      await DriverSetup.deleteOne({ driverUniqueId: uid });
    }
    if (target && target.role === 'student') {
      await StudentRoute.deleteOne({ userId: target._id });
    }
    if (target && target.role === 'admin') {
      await AdminSetup.deleteOne({ adminUniqueId: String(target.roll).toUpperCase() });
    }
    await User.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not remove user.', error: err.message });
  }
});

module.exports = router;
