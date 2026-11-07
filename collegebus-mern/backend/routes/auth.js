const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AdminSetup = require('../models/AdminSetup');
const DriverSetup = require('../models/DriverSetup');
const Notification = require('../models/Notification');
const { signToken } = require('../utils/token');
const { isValidEmail, isValidPin, isValidPhone, normText, normUid } = require('../utils/validators');
const { isValidAdminId } = require('../utils/constants');
const { resolveDriverBus } = require('../utils/driverBus');
const { requireAuth } = require('../middleware/auth');
const { emitNotification } = require('../sockets');

const router = express.Router();

// The secret code that must be entered to register a NEW admin.
// Set ADMIN_SECRET_CODE in backend/.env.
function secretCodeMatches(given) {
  const real = String(process.env.ADMIN_SECRET_CODE || '');
  if (!real) return null; // not configured
  const a = Buffer.from(String(given || '').trim());
  const b = Buffer.from(real.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeUser(user) {
  return { id: user._id, name: user.name, email: user.email, roll: user.roll, role: user.role, phone: user.phone, dept: user.dept, profileComplete: user.role === 'student' ? user.profileComplete === true : true };
}

async function addNotification(forRole, title, desc, type) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const notif = await Notification.create({ forRole, title, desc, type, time });
  emitNotification(forRole, notif);
  return notif;
}


/* Student sign-in now lives in routes/studentAuth.js (email + OTP).
   Admin and Driver sign-in below are unchanged. */

/* =================== ADMIN =================== */

router.get('/admin/status', async (req, res) => {
  const setups = await AdminSetup.find().select('adminName');
  res.json({ count: setups.length, names: setups.map(s => s.adminName), secretCodeConfigured: !!String(process.env.ADMIN_SECRET_CODE || '').trim() });
});

router.post('/admin/setup', async (req, res) => {
  try {
    const { collegeName, collegeAddress, collegePin, adminName, adminUniqueId, adminEmail, secretCode } = req.body;
    const codeOk = secretCodeMatches(secretCode);
    if (codeOk === null) return res.status(403).json({ field: 'secretCode', message: 'New admins cannot be registered yet: the owner must set ADMIN_SECRET_CODE in backend/.env and restart the server.' });
    if (!codeOk) return res.status(403).json({ field: 'secretCode', message: 'Invalid secret code.' });
    if (!collegeName || !collegeName.trim()) return res.status(400).json({ field: 'collegeName', message: 'College name is required.' });
    if (!collegeAddress || !collegeAddress.trim()) return res.status(400).json({ field: 'collegeAddress', message: 'College address is required.' });
    if (!isValidPin(collegePin)) return res.status(400).json({ field: 'collegePin', message: 'Enter a valid 6-digit PIN code.' });
    if (!adminName || adminName.trim().length < 3) return res.status(400).json({ field: 'adminName', message: "Enter the admin's full name." });

    const uid = normUid(adminUniqueId);
    if (!isValidAdminId(uid)) return res.status(400).json({ field: 'adminUniqueId', message: 'Invalid Admin Unique ID. Use JIT-ADM-<number> with a number of 101 or more, e.g. JIT-ADM-101.' });
    const already = await AdminSetup.findOne({ adminUniqueId: uid });
    if (already) return res.status(400).json({ field: 'adminUniqueId', message: 'This ID is already registered - please sign in instead.' });
    if (!isValidEmail(adminEmail)) return res.status(400).json({ field: 'adminEmail', message: 'Enter a valid email address.' });

    const setup = await AdminSetup.create({
      collegeName: collegeName.trim(), collegeAddress: collegeAddress.trim(), collegePin: collegePin.trim(),
      adminName: adminName.trim(), adminUniqueId: uid, adminEmail: adminEmail.toLowerCase().trim()
    });

    let user = await User.findOne({ role: 'admin', roll: uid });
    if (!user) user = await User.create({ name: setup.adminName, email: setup.adminEmail, roll: uid, role: 'admin' });
    else { user.name = setup.adminName; user.email = setup.adminEmail; await user.save(); }

    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user), collegeName: setup.collegeName });
  } catch (err) {
    res.status(500).json({ message: 'Could not complete admin setup.', error: err.message });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { adminName, adminUniqueId, adminEmail } = req.body;
    if (!adminName || !adminUniqueId || !adminEmail) return res.status(400).json({ message: 'All fields are required.' });
    const uid = normUid(adminUniqueId);

    const setup = await AdminSetup.findOne({ adminUniqueId: uid });
    if (!setup) return res.status(400).json({ message: 'Incorrect information. Please check your login details.' });
    const nameOk = normText(adminName) === normText(setup.adminName);
    const emailOk = normText(adminEmail) === normText(setup.adminEmail);
    if (!nameOk || !emailOk) return res.status(400).json({ message: 'Incorrect information. Please check your login details.' });

    let user = await User.findOne({ role: 'admin', roll: uid });
    if (!user) user = await User.create({ name: setup.adminName, email: setup.adminEmail, roll: uid, role: 'admin' });

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Admin sign-in failed.', error: err.message });
  }
});

/* =================== DRIVER =================== */

router.get('/driver/status', async (req, res) => {
  const setups = await DriverSetup.find().select('driverName');
  res.json({ count: setups.length, names: setups.map(s => s.driverName) });
});

// Drivers are now created ONLY by an admin (Admin panel -> Manage Drivers),
// so there is no self-registration endpoint anymore.
router.post('/driver/setup', (req, res) => {
  res.status(403).json({ message: 'Drivers are added by the admin. Please ask your admin for your Driver Unique ID.' });
});

router.post('/driver/login', async (req, res) => {
  try {
    const { driverName, driverUniqueId, driverEmail } = req.body;
    if (!driverName || !driverUniqueId || !driverEmail) return res.status(400).json({ message: 'All fields are required.' });
    const uid = normUid(driverUniqueId);

    const setup = await DriverSetup.findOne({ driverUniqueId: uid });
    if (!setup) return res.status(400).json({ message: 'Incorrect information. Please check your login details.' });
    const nameOk = normText(driverName) === normText(setup.driverName);
    const emailOk = normText(driverEmail) === normText(setup.driverEmail);
    if (!nameOk || !emailOk) return res.status(400).json({ message: 'Incorrect information. Please check your login details.' });

    let user = await User.findOne({ role: 'driver', roll: uid });
    if (!user) user = await User.create({ name: setup.driverName, email: setup.driverEmail, roll: uid, role: 'driver' });

    await resolveDriverBus(uid, setup.driverName, user.phone);

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Driver sign-in failed.', error: err.message });
  }
});

/* =================== SESSION =================== */

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: safeUser(req.user) });
});

module.exports = router;
