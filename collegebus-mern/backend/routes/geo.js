const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolve, searchPlaces, setPosition, resetPosition } = require('../utils/geocode');
const { roadPathFor } = require('../utils/roadRoute');

const router = express.Router();

// Body: { names: ['Teka Naka', 'Kamal Chowk', ...] }
router.post('/resolve', requireAuth, async (req, res) => {
  try {
    const names = Array.isArray(req.body && req.body.names) ? req.body.names.slice(0, 80).map(n => String(n)) : [];
    res.json({ results: await resolve(names) });
  } catch (err) {
    res.status(500).json({ message: 'Could not look up map positions.', error: err.message });
  }
});

// Body: { points: [{ lat, lng }, ...] }  (stops in order)
// Replies { path: [[lat,lng], ...] } following real roads, or { path: null }
// if the road service is unreachable (the map then falls back to a straight line).
router.post('/route', requireAuth, async (req, res) => {
  try {
    const raw = Array.isArray(req.body && req.body.points) ? req.body.points.slice(0, 80) : [];
    const points = raw
      .map(p => ({ lat: Number(p && p.lat), lng: Number(p && p.lng) }))
      .filter(p => isFinite(p.lat) && isFinite(p.lng));
    let path = null;
    try { path = await roadPathFor(points); } catch (err) { console.warn('Road route lookup failed:', err.message); }
    res.json({ path });
  } catch (err) {
    res.status(500).json({ message: 'Could not build the road route.', error: err.message });
  }
});

// ---- Map Setup (admin only) ----
function validPoint(lat, lng) {
  return isFinite(lat) && isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
}

// GET /api/geo/search?q=JIT College  ->  { results: [{ name, lat, lng }] }
router.get('/search', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    res.json({ results: await searchPlaces(req.query.q) });
  } catch (err) {
    res.status(502).json({ message: 'Place search is not reachable right now. Check the internet and try again.', error: err.message });
  }
});

// Body: { name, lat, lng } - the admin put this stop here on the map.
router.post('/set', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    const lat = Number(req.body && req.body.lat);
    const lng = Number(req.body && req.body.lng);
    if (!name) return res.status(400).json({ message: 'Stop name is required.' });
    if (!validPoint(lat, lng)) return res.status(400).json({ message: 'That position is not valid.' });
    await setPosition(name, lat, lng);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not save the position.', error: err.message });
  }
});

// Body: { name } - go back to the automatic search for this stop.
router.post('/reset', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ message: 'Stop name is required.' });
    await resetPosition(name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not reset the position.', error: err.message });
  }
});

module.exports = router;
