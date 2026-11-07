const express = require('express');
const Settings = require('../models/Settings');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  let s = await Settings.findOne({ key: 'main' });
  if (!s) s = await Settings.create({ key: 'main' });
  res.json({ settings: s });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { collegeName, officeContact, interval } = req.body;
    let s = await Settings.findOne({ key: 'main' });
    if (!s) s = new Settings({ key: 'main' });
    s.collegeName = (collegeName || s.collegeName || '').trim();
    s.officeContact = (officeContact || '').trim();
    s.interval = Number(interval) || s.interval || 6;
    await s.save();
    res.json({ settings: s });
  } catch (err) {
    res.status(500).json({ message: 'Could not save settings.', error: err.message });
  }
});

module.exports = router;
